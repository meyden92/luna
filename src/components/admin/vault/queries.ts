import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import { getStorageStatus, getVaultForAdmin } from '@/server/fns/admin/vault';

export const vaultQueryOptions = queryOptions({
  queryKey: queryKeys.admin.vault,
  queryFn: () => getVaultForAdmin(),
});

export const storageStatusQueryOptions = queryOptions({
  queryKey: queryKeys.admin.storageStatus,
  queryFn: () => getStorageStatus(),
});
