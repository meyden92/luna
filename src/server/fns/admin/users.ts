import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  getFileById,
  getUserById,
  getUserSummary,
  hardDeleteFiles,
  listActiveUserFileKeys,
  listActiveUsers,
  listAdminUserFiles,
  listAdminUsersPage,
  listGroupsByKeys,
  listUserGroupIds,
  reactivateUserAccount,
  replaceUserGroupAssignments,
  softDeleteUserAccount,
  suspendUserAccount,
  updateUserStorageQuota,
} from '@/db/queries/admin';
import { storageUsage } from '@/db/queries/files';
import { env } from '@/libs/env';
import { ensureBaseGroups, ensureUserHasDefaultGroup, includeDefaultGroup } from '@/libs/rbac/default-group';
import { ADMIN_GROUP_KEY, invalidateAuthorizationContext, USER_GROUP_KEY } from '@/libs/rbac/service';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { MAX_STORAGE_QUOTA_MIB } from '@/libs/storage-quota';
import { createUserSchema, resetUserPasswordSchema } from '@/schemas/credentials-schema';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const DELETED_BAN_REASON = 'Your account has been deleted and is no longer available.';
const SUSPENDED_BAN_REASON = 'Your account has been suspended by an administrator';

export const listAdminUsers = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return listActiveUsers();
  });

const adminUsersQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  sort: z.enum(['email', 'name', 'role', 'files']).default('email'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const listAdminUsersWithFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(adminUsersQuerySchema)
  .handler(async ({ data }) => {
    const { users, total } = await listAdminUsersPage(data);
    return { users, total, totalPages: Math.ceil(total / data.pageSize) };
  });

export const getAdminUserDetail = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const [user, usage] = await Promise.all([getUserById(data.id), storageUsage(data.id)]);
    if (!user) throw new Error('User not found');
    return { ...user, fileCount: usage.fileCount, totalSize: usage.totalBytes };
  });

const userStorageQuotaSchema = z.object({
  id: z.string().min(1),
  storageQuotaMiB: z.number().int().min(0).max(MAX_STORAGE_QUOTA_MIB),
});

export const updateAdminUserStorageQuota = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userStorageQuotaSchema)
  .handler(async ({ data, context }) => {
    const updated = await updateUserStorageQuota(data, adminIdFromCtx(context));
    if (!updated) throw new Error('User not found');
    return { success: true, user: { id: updated.id, storageQuotaMiB: updated.storageQuotaMiB } };
  });

const userFilesQuerySchema = z.object({
  userId: z.string().min(1),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sort: z.enum(['size', 'date', 'private']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  type: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const getAdminUserFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userFilesQuerySchema)
  .handler(async ({ data }) => {
    let dateTo: Date | undefined;
    if (data.dateTo) {
      dateTo = new Date(data.dateTo);
      dateTo.setHours(23, 59, 59, 999);
    }

    const [user, page] = await Promise.all([
      getUserSummary(data.userId),
      listAdminUserFiles({
        ownerId: data.userId,
        page: data.page,
        pageSize: data.pageSize,
        sort: data.sort,
        order: data.order,
        contentTypePrefix: data.type,
        dateFrom: data.dateFrom ? new Date(data.dateFrom) : undefined,
        dateTo,
      }),
    ]);
    if (!user) throw new Error('User not found');

    return {
      user,
      files: page.files,
      totalFiles: page.totalFiles,
      totalPages: Math.ceil(page.totalFiles / data.pageSize),
    };
  });

const userIdSchema = z.object({ id: z.string().min(1) });

export const deleteAdminUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdSchema)
  .handler(async ({ data, context }) => {
    const adminId = adminIdFromCtx(context);
    if (adminId === data.id) throw new Error('You cannot delete your own account');

    const files = await listActiveUserFileKeys(data.id);

    if (files.length > 0) {
      // DeleteObjects accepts max 1000 keys per request and reports per-key
      // failures in Errors instead of throwing — only drop DB records whose
      // S3 object is actually gone, so failures stay visible for retry.
      const failedKeys = new Set<string>();
      const batchSize = 1000;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const result = await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: env.AWS_BUCKET_NAME,
            Delete: { Objects: batch.map((f) => ({ Key: fileS3Key(data.id, f.url) })), Quiet: false },
          }),
        );
        for (const err of result.Errors || []) {
          if (err.Key) failedKeys.add(err.Key);
        }
      }

      const deletableIds = files.filter((f) => !failedKeys.has(fileS3Key(data.id, f.url))).map((f) => f.id);
      await hardDeleteFiles(deletableIds, adminId);

      if (failedKeys.size > 0) {
        throw new Error(`Failed to delete ${failedKeys.size} file(s) from storage; their records were kept. Retry the deletion.`);
      }
    }

    return softDeleteUserAccount({ id: data.id, banReason: DELETED_BAN_REASON }, adminId);
  });

export const suspendUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdSchema)
  .handler(async ({ data, context }) => {
    await suspendUserAccount({ id: data.id, banReason: SUSPENDED_BAN_REASON }, adminIdFromCtx(context));
    return { success: true };
  });

export const reactivateUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdSchema)
  .handler(async ({ data, context }) => {
    await reactivateUserAccount(data.id, adminIdFromCtx(context));
    return { success: true };
  });

const userFileSchema = z.object({ userId: z.string().min(1), fileId: z.string().min(1) });

export const deleteAdminUserFile = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userFileSchema)
  .handler(async ({ data, context }) => {
    const file = await getFileById(data.fileId);
    if (!file) throw new Error('File not found');
    if (file.ownerId !== data.userId) throw new Error('File does not belong to the specified user');

    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: fileS3Key(file.ownerId, file.url) }));
    await hardDeleteFiles([data.fileId], adminIdFromCtx(context));
    return { success: true };
  });

const userIdParam = z.object({ userId: z.string().min(1) });

export const getUserGroups = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdParam)
  .handler(async ({ data }) => {
    const user = await getUserSummary(data.userId);
    if (!user) throw new Error('User not found');

    await ensureBaseGroups();
    await ensureUserHasDefaultGroup(data.userId);

    const baseGroups = await listGroupsByKeys([USER_GROUP_KEY, ADMIN_GROUP_KEY]);

    baseGroups.sort((a, b) => {
      if (a.key === USER_GROUP_KEY) return -1;
      if (b.key === USER_GROUP_KEY) return 1;
      return a.key.localeCompare(b.key);
    });

    const assignedGroupIds = await listUserGroupIds({ userId: data.userId, groupIds: baseGroups.map((g) => g.id) });

    return {
      user,
      assignedGroupIds,
      availableGroups: baseGroups,
      requiredGroupKeys: [USER_GROUP_KEY],
    };
  });

const updateUserGroupsSchema = z.object({
  userId: z.string().min(1),
  groupIds: z.array(z.string()).default([]),
});

export const updateUserGroups = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(updateUserGroupsSchema)
  .handler(async ({ data, context }) => {
    const target = await getUserSummary(data.userId);
    if (!target) throw new Error('User not found');

    const { userGroupId, adminGroupId } = await ensureBaseGroups();
    const allowed = new Set([userGroupId, adminGroupId]);

    const requested = [...new Set(data.groupIds)];
    if (requested.some((id) => !allowed.has(id))) throw new Error('Only user and admin groups can be assigned');

    const finalGroupIds = await includeDefaultGroup(requested);
    await replaceUserGroupAssignments({ userId: data.userId, groupIds: finalGroupIds }, adminIdFromCtx(context));

    invalidateAuthorizationContext(data.userId);
    return { success: true, assignedGroupIds: finalGroupIds };
  });

/**
 * Registration is closed (issue #54), so this is the only way a User comes into
 * existence through the app. Authorisation is RBAC's, via the `admin`
 * middleware — see `libs/auth/credentials` for why Better-Auth's own
 * `/admin/create-user` endpoint is deliberately not used.
 */
export const createAdminUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(createUserSchema)
  .handler(async ({ data }) => {
    const { createUserWithCredentials } = await import('@/libs/auth/credentials');
    return createUserWithCredentials(data);
  });

/**
 * The administrator half of account recovery. LunaShare sends no email, so a
 * forgotten password is resolved here or by `scripts/auth/set-credentials.ts`.
 */
export const resetAdminUserPassword = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(resetUserPasswordSchema)
  .handler(async ({ data }) => {
    const { setUserCredentials } = await import('@/libs/auth/credentials');
    await setUserCredentials({ userId: data.userId, password: data.newPassword });
    return { success: true };
  });
