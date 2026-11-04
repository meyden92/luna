import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import type { MediaKind } from '@/libs/studio/types';
import { getStudioBudget, getStudioCatalog, getUnseenGenerationCount, listGenerations } from '@/server/fns/studio';

export const studioCatalogQueryOptions = queryOptions({
  queryKey: queryKeys.studio.catalog,
  queryFn: () => getStudioCatalog(),
});

export const studioBudgetQueryOptions = queryOptions({
  queryKey: queryKeys.studio.budget,
  queryFn: () => getStudioBudget(),
});

export const unseenGenerationsQueryOptions = queryOptions({
  queryKey: queryKeys.studio.unseen,
  queryFn: () => getUnseenGenerationCount(),
});

export interface HistoryFilters {
  categoryId?: string;
  mediaKinds?: MediaKind[];
}

/** The history pages for these filters. Studio events patch every cached list in place. */
export function generationsQueryOptions(filters: HistoryFilters) {
  return infiniteQueryOptions({
    queryKey: queryKeys.studio.generations({ ...filters }),
    queryFn: ({ pageParam }) => listGenerations({ data: { ...filters, cursor: pageParam ?? undefined } }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
}

export type GenerationsPage = Awaited<ReturnType<typeof listGenerations>>;
