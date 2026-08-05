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

type StorageQuotaTransaction = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray, ...values: unknown[]) => Promise<T>;
  file: {
    aggregate: (args: { where: { ownerId: string; isDeleted: false }; _sum: { size: true } }) => Promise<{ _sum: { size: number | null } }>;
  };
};

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

export async function ensureStorageQuotaAvailable(
  tx: StorageQuotaTransaction,
  userId: string,
  incomingBytes: number,
): Promise<StorageQuotaDetails> {
  const lockedUsers = await tx.$queryRaw<Array<{ storageQuotaMiB: number | null }>>`
    SELECT storage_quota_mib AS storageQuotaMiB FROM \`user\` WHERE id = ${userId} FOR UPDATE
  `;
  const quotaMiB = lockedUsers[0]?.storageQuotaMiB ?? DEFAULT_STORAGE_QUOTA_MIB;
  const quotaBytes = storageQuotaMiBToBytes(quotaMiB);
  const used = await tx.file.aggregate({
    where: { ownerId: userId, isDeleted: false },
    _sum: { size: true },
  });
  const usedBytes = used._sum.size ?? 0;
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
