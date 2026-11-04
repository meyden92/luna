import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import { getStudioStatus } from '@/server/fns/studio';

/** Whether the Studio is enabled; fixed for the life of the server process. */
export const studioStatusQueryOptions = queryOptions({
  queryKey: queryKeys.studio.status,
  queryFn: () => getStudioStatus(),
  staleTime: Number.POSITIVE_INFINITY,
});
