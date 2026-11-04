import { createFileRoute } from '@tanstack/react-router';
import { ModelList } from '@/components/admin/studio/ModelList';
import { studioCategoriesQueryOptions, studioModelsQueryOptions } from '@/components/admin/studio/queries';

export const Route = createFileRoute('/_admin/admin/studio/models/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(studioModelsQueryOptions),
      context.queryClient.ensureQueryData(studioCategoriesQueryOptions),
    ]),
  head: () => ({ meta: [{ title: 'Studio models | LunaShare' }] }),
  component: ModelList,
});
