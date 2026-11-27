import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import { getPlatformSettingsForAdmin } from '@/server/fns/admin/platform-settings';

export const platformSettingsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.platformSettings,
  queryFn: () => getPlatformSettingsForAdmin(),
});
