import { DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { DiffEngine } from '@/libs/audit/diff-engine';
import { MetadataCollector } from '@/libs/audit/metadata-collector';
import { Summarizer } from '@/libs/audit/summarizer';
import { env } from '@/libs/env';
import prisma, { prismabase } from '@/libs/prismadb';
import { ensureBaseGroups, ensureUserHasDefaultGroup, includeDefaultGroup } from '@/libs/rbac/default-group';
import { getRbacPrisma } from '@/libs/rbac/prisma';
import { ADMIN_GROUP_KEY, invalidateAuthorizationContext, USER_GROUP_KEY } from '@/libs/rbac/service';
import { fileS3Key, s3Client } from '@/libs/S3Helper';
import { MAX_STORAGE_QUOTA_MIB } from '@/libs/storage-quota';
import { userIdFromCtx as adminIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

type AuditJsonInput = Prisma.InputJsonValue | undefined;

function auditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function auditMetadata(metadata: unknown): AuditJsonInput {
  return metadata ? auditJson(metadata) : undefined;
}

function deleteAuditEntry(
  model: string,
  row: { id: string },
  userId: string | null,
  metadata: AuditJsonInput,
  changeSet: string,
): Prisma.AuditLogCreateManyInput {
  return {
    model,
    action: 'delete',
    recordId: row.id,
    userId,
    before: auditJson(row),
    after: undefined,
    metadata,
    changeSet,
    summary: Summarizer.generateActionSummary(model, 'delete', [], row.id),
    fieldChanges: undefined,
  };
}

function updateAuditEntry(
  model: string,
  before: { id: string },
  after: { id: string },
  userId: string | null,
  metadata: AuditJsonInput,
  changeSet: string,
): Prisma.AuditLogCreateManyInput {
  const diffResult = DiffEngine.generateDiffResult(before, after);
  return {
    model,
    action: 'update',
    recordId: before.id,
    userId,
    before: auditJson(before),
    after: auditJson(after),
    metadata,
    changeSet,
    summary: Summarizer.generateActionSummary(model, 'update', diffResult.changes, before.id),
    fieldChanges: diffResult.hasChanges ? auditJson(diffResult.changes) : undefined,
  };
}

export const listAdminUsers = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    return prisma.user.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  });

const adminUsersQuerySchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().optional(),
  sort: z.enum(['email', 'name', 'role', 'files']).default('email'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

type AdminUserListItem = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  image: string | null;
  storageQuotaMiB: number;
};

type AdminUserListItemWithStats = AdminUserListItem & {
  fileCount: number;
  totalSize: number;
};

type RawAdminUserListItem = AdminUserListItem & {
  fileCount: number | bigint | string;
  totalSize: number | bigint | string | null;
};

async function withUserFileStats(users: AdminUserListItem[]) {
  if (users.length === 0) return [];

  const [sizes, counts] = await Promise.all([
    prisma.file.groupBy({
      by: ['ownerId'],
      where: { isDeleted: false, ownerId: { in: users.map((user) => user.id) } },
      _sum: { size: true },
    }),
    prisma.file.groupBy({
      by: ['ownerId'],
      where: { isDeleted: false, ownerId: { in: users.map((user) => user.id) } },
      _count: { _all: true },
    }),
  ]);

  const sizeByOwner = new Map(sizes.map((size) => [size.ownerId, size._sum.size ?? 0]));
  const countByOwner = new Map(counts.map((count) => [count.ownerId, count._count._all]));

  return users.map((user) => ({
    ...user,
    fileCount: countByOwner.get(user.id) ?? 0,
    totalSize: sizeByOwner.get(user.id) ?? 0,
  }));
}

function normalizeUserFileStats(user: RawAdminUserListItem): AdminUserListItemWithStats {
  return {
    ...user,
    fileCount: Number(user.fileCount),
    totalSize: Number(user.totalSize ?? 0),
  };
}

export const listAdminUsersWithFiles = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(adminUsersQuerySchema)
  .handler(async ({ data }) => {
    const search = data.search?.trim();
    const where: Prisma.UserWhereInput = {
      isDeleted: false,
      ...(search
        ? {
            OR: [{ email: { contains: search } }, { name: { contains: search } }],
          }
        : {}),
    };
    const skip = (data.page - 1) * data.pageSize;

    if (data.sort === 'files') {
      const searchFilter = search ? 'AND (u.email LIKE ? OR u.name LIKE ?)' : '';
      const orderDirection = data.order === 'asc' ? 'ASC' : 'DESC';
      const queryParams = search ? [`%${search}%`, `%${search}%`, data.pageSize, skip] : [data.pageSize, skip];
      const [users, total] = await Promise.all([
        prisma.$queryRawUnsafe<RawAdminUserListItem[]>(
          `
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.image,
            u.storage_quota_mib AS storageQuotaMiB,
            COUNT(f.id) AS fileCount,
            COALESCE(SUM(f.size), 0) AS totalSize
          FROM \`user\` u
          LEFT JOIN \`file\` f ON f.ownerId = u.id AND f.isDeleted = 0
          WHERE u.isDeleted = 0 ${searchFilter}
          GROUP BY u.id, u.name, u.email, u.role, u.image, u.storage_quota_mib
          ORDER BY fileCount ${orderDirection}, u.email ASC, u.id ASC
          LIMIT ? OFFSET ?
        `,
          ...queryParams,
        ),
        prisma.user.count({ where }),
      ]);

      return { users: users.map(normalizeUserFileStats), total, totalPages: Math.ceil(total / data.pageSize) };
    }

    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      data.sort === 'email' ? [{ email: data.order }, { id: 'asc' }] : [{ [data.sort]: data.order }, { email: 'asc' }, { id: 'asc' }];
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          image: true,
          storageQuotaMiB: true,
        },
        orderBy,
        skip,
        take: data.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: await withUserFileStats(users),
      total,
      totalPages: Math.ceil(total / data.pageSize),
    };
  });

export const getAdminUserDetail = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const [user, fileAggregate] = await Promise.all([
      prisma.user.findUnique({ where: { id: data.id } }),
      prisma.file.aggregate({
        where: { ownerId: data.id, isDeleted: false },
        _count: { _all: true },
        _sum: { size: true },
      }),
    ]);
    if (!user) throw new Error('User not found');
    return {
      ...user,
      fileCount: fileAggregate._count._all,
      totalSize: fileAggregate._sum.size ?? 0,
    };
  });

const userStorageQuotaSchema = z.object({
  id: z.string().min(1),
  storageQuotaMiB: z.number().int().min(0).max(MAX_STORAGE_QUOTA_MIB),
});

export const updateAdminUserStorageQuota = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userStorageQuotaSchema)
  .handler(async ({ data }) => {
    const user = await prisma.user.update({
      where: { id: data.id },
      data: { storageQuotaMiB: data.storageQuotaMiB },
      select: { id: true, storageQuotaMiB: true },
    });
    return { success: true, user };
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
    const where: Prisma.FileWhereInput = { ownerId: data.userId, isDeleted: false };
    if (data.type) where.contentType = { startsWith: data.type };
    if (data.dateFrom || data.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (data.dateFrom) createdAt.gte = new Date(data.dateFrom);
      if (data.dateTo) {
        const end = new Date(data.dateTo);
        end.setHours(23, 59, 59, 999);
        createdAt.lte = end;
      }
      where.createdAt = createdAt;
    }

    let orderBy: Prisma.FileOrderByWithRelationInput = { createdAt: 'desc' };
    if (data.sort) {
      const order = data.order || 'desc';
      if (data.sort === 'size') orderBy = { size: order };
      else if (data.sort === 'date') orderBy = { createdAt: order };
      else if (data.sort === 'private') orderBy = { private: order };
    }

    const skip = (data.page - 1) * data.pageSize;
    const [user, files, totalFiles] = await Promise.all([
      prisma.user.findUnique({
        where: { id: data.userId },
        select: { id: true, name: true, email: true },
      }),
      prisma.file.findMany({ where, orderBy, skip, take: data.pageSize }),
      prisma.file.count({ where }),
    ]);
    if (!user) throw new Error('User not found');

    return {
      user,
      files,
      totalFiles,
      totalPages: Math.ceil(totalFiles / data.pageSize),
    };
  });

const userIdSchema = z.object({ id: z.string().min(1) });

export const deleteAdminUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdSchema)
  .handler(async ({ data, context }) => {
    if (adminIdFromCtx(context) === data.id) throw new Error('You cannot delete your own account');

    const target = await prisma.user.findUnique({
      where: { id: data.id },
      select: {
        id: true,
        File: {
          where: { isDeleted: false },
          select: { id: true, url: true },
        },
      },
    });
    if (!target) throw new Error('User not found');

    if (target.File.length > 0) {
      // DeleteObjects accepts max 1000 keys per request and reports per-key
      // failures in Errors instead of throwing — only drop DB records whose
      // S3 object is actually gone, so failures stay visible for retry.
      const failedKeys = new Set<string>();
      const batchSize = 1000;
      for (let i = 0; i < target.File.length; i += batchSize) {
        const batch = target.File.slice(i, i + batchSize);
        const result = await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: env.AWS_BUCKET_NAME,
            Delete: { Objects: batch.map((f) => ({ Key: fileS3Key(target.id, f.url) })), Quiet: false },
          }),
        );
        for (const err of result.Errors || []) {
          if (err.Key) failedKeys.add(err.Key);
        }
      }

      const deletableIds = target.File.filter((f) => !failedKeys.has(fileS3Key(target.id, f.url))).map((f) => f.id);
      await prisma.file.deleteMany({ where: { id: { in: deletableIds }, ownerId: data.id } });

      if (failedKeys.size > 0) {
        throw new Error(`Failed to delete ${failedKeys.size} file(s) from storage; their records were kept. Retry the deletion.`);
      }
    }
    const adminId = adminIdFromCtx(context);
    const metadata = auditMetadata(await MetadataCollector.collectFromRequest());
    const changeSetId = MetadataCollector.generateChangeSetId();

    return prismabase.$transaction(async (tx) => {
      const [beforeUser, beforeSessions] = await Promise.all([
        tx.user.findUnique({ where: { id: data.id } }),
        tx.session.findMany({ where: { userId: data.id } }),
      ]);
      if (!beforeUser) throw new Error('User not found');

      await tx.session.deleteMany({ where: { userId: data.id } });
      const updatedUser = await tx.user.update({
        where: { id: data.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          banned: true,
          banReason: 'Your account has been deleted and is no longer available.',
          banExpires: null,
        },
      });

      await tx.auditLog.createMany({
        data: [
          ...beforeSessions.map((row) => deleteAuditEntry('Session', row, adminId, metadata, changeSetId)),
          updateAuditEntry('User', beforeUser, updatedUser, adminId, metadata, changeSetId),
        ],
      });

      return updatedUser;
    });
  });

export const suspendUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdSchema)
  .handler(async ({ data, context }) => {
    const adminId = adminIdFromCtx(context);
    const metadata = auditMetadata(await MetadataCollector.collectFromRequest());
    const changeSetId = MetadataCollector.generateChangeSetId();

    await prismabase.$transaction(async (tx) => {
      const [beforeUser, beforeSessions] = await Promise.all([
        tx.user.findUnique({ where: { id: data.id } }),
        tx.session.findMany({ where: { userId: data.id } }),
      ]);
      if (!beforeUser) throw new Error('User not found');

      const updatedUser = await tx.user.update({
        where: { id: data.id },
        data: {
          banned: true,
          banReason: 'Your account has been suspended by an administrator',
          banExpires: null,
        },
      });
      await tx.session.deleteMany({ where: { userId: data.id } });

      await tx.auditLog.createMany({
        data: [
          updateAuditEntry('User', beforeUser, updatedUser, adminId, metadata, changeSetId),
          ...beforeSessions.map((row) => deleteAuditEntry('Session', row, adminId, metadata, changeSetId)),
        ],
      });
    });
    return { success: true };
  });

export const reactivateUser = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdSchema)
  .handler(async ({ data }) => {
    await prisma.user.update({
      where: { id: data.id },
      data: { banned: false, banReason: null, banExpires: null },
    });
    return { success: true };
  });

const userFileSchema = z.object({ userId: z.string().min(1), fileId: z.string().min(1) });

export const deleteAdminUserFile = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userFileSchema)
  .handler(async ({ data }) => {
    const file = await prisma.file.findUnique({ where: { id: data.fileId } });
    if (!file) throw new Error('File not found');
    if (file.ownerId !== data.userId) throw new Error('File does not belong to the specified user');

    await s3Client.send(new DeleteObjectCommand({ Bucket: env.AWS_BUCKET_NAME, Key: fileS3Key(file.ownerId, file.url) }));
    await prisma.file.delete({ where: { id: data.fileId } });
    return { success: true };
  });

const userIdParam = z.object({ userId: z.string().min(1) });

export const getUserGroups = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(userIdParam)
  .handler(async ({ data }) => {
    const rbacPrisma = getRbacPrisma(['rbacGroup', 'userGroupAssignment']);
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true, email: true },
    });
    if (!user) throw new Error('User not found');

    await ensureBaseGroups();
    await ensureUserHasDefaultGroup(data.userId);

    const baseGroups = await rbacPrisma.rbacGroup.findMany({
      where: { key: { in: [USER_GROUP_KEY, ADMIN_GROUP_KEY] } },
      select: { id: true, key: true, name: true, isSystem: true },
    });

    baseGroups.sort((a, b) => {
      if (a.key === USER_GROUP_KEY) return -1;
      if (b.key === USER_GROUP_KEY) return 1;
      return a.key.localeCompare(b.key);
    });

    const baseGroupIds = baseGroups.map((g) => g.id);
    const assignments = await rbacPrisma.userGroupAssignment.findMany({
      where: { userId: data.userId, groupId: { in: baseGroupIds } },
      select: { groupId: true },
    });

    return {
      user,
      assignedGroupIds: assignments.map((a) => a.groupId),
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
    const target = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } });
    if (!target) throw new Error('User not found');

    const { userGroupId, adminGroupId } = await ensureBaseGroups();
    const allowed = new Set([userGroupId, adminGroupId]);

    const requested = [...new Set(data.groupIds)];
    if (requested.some((id) => !allowed.has(id))) throw new Error('Only user and admin groups can be assigned');

    const finalGroupIds = await includeDefaultGroup(requested);
    const adminId = adminIdFromCtx(context);
    const metadata = auditMetadata(await MetadataCollector.collectFromRequest());
    const changeSetId = MetadataCollector.generateChangeSetId();

    await prismabase.$transaction(async (tx) => {
      const beforeAssignments = await tx.userGroupAssignment.findMany({ where: { userId: data.userId } });

      await tx.userGroupAssignment.deleteMany({ where: { userId: data.userId } });
      await tx.userGroupAssignment.createMany({
        data: finalGroupIds.map((groupId) => ({
          userId: data.userId,
          groupId,
          createdByUserId: adminId,
        })),
        skipDuplicates: true,
      });

      if (beforeAssignments.length > 0) {
        await tx.auditLog.createMany({
          data: beforeAssignments.map((row) => deleteAuditEntry('UserGroupAssignment', row, adminId, metadata, changeSetId)),
        });
      }
    });

    invalidateAuthorizationContext(data.userId);
    return { success: true, assignedGroupIds: finalGroupIds };
  });
