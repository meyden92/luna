import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import { getUserSettings } from '@/server/fns/user';

export interface UserGallerySettings {
  showAllFilesIncludesFoldered: boolean;
}

export const userGallerySettingsQueryOptions = queryOptions({
  queryKey: queryKeys.userSettings.all,
  queryFn: async (): Promise<UserGallerySettings> => {
    return getUserSettings();
  },
  staleTime: 5 * 60 * 1000, // 5 minutes
  refetchOnWindowFocus: false,
});

export function useUserGallerySettings() {
  return useSuspenseQuery(userGallerySettingsQueryOptions);
}
