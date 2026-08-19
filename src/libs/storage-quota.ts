import type { Tx } from '@/db/client';
import { storageUsage } from '@/db/queries/files';
import { lockUserStorageQuota } from '@/db/queries/storage';

export const DEFAULT_STORAGE_QUOTA_MIB = 2048;
export const BYTES_PER_MIB = 1024 * 1024;
export const MAX_STORAGE_QUOTA_MIB = 2_147_483_647;

export type StorageQuotaDetails = {
  usedBytes: number;
  quotaBytes: number;
  remainingBytes: number;
  attemptedBytes: number;
};

export class StorageQuotaExceededError extends Error {
  readonly code = 'STORAGE_QUOTA_EXCEEDED';
  readonly status = 413;
  readonly details: StorageQuotaDetails;

  constructor(details: StorageQuotaDetails) {
    super(formatStorageQuotaExceededMessage(details));
    this.details = details;
  }
}

export function storageQuotaMiBToBytes(storageQuotaMiB: number | null | undefined): number {
  return (storageQuotaMiB ?? DEFAULT_STORAGE_QUOTA_MIB) * BYTES_PER_MIB;
}

export function quotaBytesToMiB(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_MIB);
}

export function storageQuotaExceededPayload(error: StorageQuotaExceededError) {
  return {
    error: error.message,
    code: error.code,
    ...error.details,
  };
}

/**
 * Admission control for an upload. Must run inside a transaction: the quota read
 * takes a row lock so two concurrent uploads cannot both see the same free space
 * and both fit, and a lock outside a transaction is released immediately.
 */
export async function ensureStorageQuotaAvailable(tx: Tx, userId: string, incomingBytes: number): Promise<StorageQuotaDetails> {
  const quotaMiB = await lockUserStorageQuota(userId, tx);
  const { totalBytes: usedBytes } = await storageUsage(userId, tx);
  return evaluateQuota(quotaMiB, usedBytes, incomingBytes);
}

/**
 * TEMPORARY, and deleted by the batch that moves the last caller.
 *
 * Five sites still take the quota under a Prisma transaction — both upload paths
 * (#34), the beautifier and generation utilities (#38), and the sync service
 * (#39). Admission control and the insert it guards have to share one
 * transaction, so this cannot be half-migrated: splitting them across a Drizzle
 * transaction and a Prisma one would release the lock before the insert and let
 * two concurrent uploads both fit.
 *
 * It is a separate named function rather than a union-typed parameter so
 * `grep ensureStorageQuotaAvailableViaPrisma` shows exactly what is left to move.
 */
type PrismaStorageQuotaTransaction = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  file: {
    aggregate: (args: { where: { ownerId: string; isDeleted: false }; _sum: { size: true } }) => Promise<{ _sum: { size: number | null } }>;
  };
};

export async function ensureStorageQuotaAvailableViaPrisma(
  tx: PrismaStorageQuotaTransaction,
  userId: string,
  incomingBytes: number,
): Promise<StorageQuotaDetails> {
  const lockedUsers = await tx.$queryRaw<Array<{ storageQuotaMiB: number | null }>>`
    SELECT storage_quota_mib AS storageQuotaMiB FROM \`user\` WHERE id = ${userId} FOR UPDATE
  `;
  const used = await tx.file.aggregate({ where: { ownerId: userId, isDeleted: false }, _sum: { size: true } });
  return evaluateQuota(lockedUsers[0]?.storageQuotaMiB ?? null, used._sum.size ?? 0, incomingBytes);
}

function evaluateQuota(quotaMiB: number | null, usedBytes: number, incomingBytes: number): StorageQuotaDetails {
  const quotaBytes = storageQuotaMiBToBytes(quotaMiB);
  const remainingBytes = Math.max(quotaBytes - usedBytes, 0);
  const details = { usedBytes, quotaBytes, remainingBytes, attemptedBytes: incomingBytes };

  if (usedBytes + incomingBytes > quotaBytes) {
    throw new StorageQuotaExceededError(details);
  }

  return details;
}

function formatStorageQuotaExceededMessage(details: StorageQuotaDetails): string {
  return `Storage quota exceeded. ${formatQuotaSize(details.usedBytes)} of ${formatQuotaSize(
    details.quotaBytes,
  )} used; this upload needs ${formatQuotaSize(details.attemptedBytes)}. Ask an admin to increase your quota.`;
}

function formatQuotaSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${Number.parseFloat(value.toFixed(2))} ${units[unitIndex]}`;
}
