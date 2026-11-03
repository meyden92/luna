import { queryOptions } from '@tanstack/react-query';
import { queryKeys } from '@/libs/query-keys';
import { getStudioModel, listStudioCategories, listStudioModels } from '@/server/fns/admin/studio';

export const studioCategoriesQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.categories,
  queryFn: () => listStudioCategories(),
});

export const studioModelsQueryOptions = queryOptions({
  queryKey: queryKeys.adminStudio.models,
  queryFn: () => listStudioModels(),
});

export const studioModelQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminStudio.model(id),
    queryFn: () => getStudioModel({ data: { id } }),
  });
