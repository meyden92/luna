/**
 * Storage-quota vocabulary: constants, the error type, and pure conversions.
 *
 * This module MUST stay free of database imports. Admin routes and components
 * import `MAX_STORAGE_QUOTA_MIB` and the byte conversions, so anything reachable
 * from here is reachable from the client bundle. Admission control itself reads
 * the database and therefore lives in `src/db/queries/storage.ts`.
 */
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

export function evaluateQuota(quotaMiB: number | null, usedBytes: number, incomingBytes: number): StorageQuotaDetails {
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
