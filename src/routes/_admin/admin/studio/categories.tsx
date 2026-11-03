import { createFileRoute } from '@tanstack/react-router';
import { CategoryManager } from '@/components/admin/studio/CategoryManager';
import { studioCategoriesQueryOptions } from '@/components/admin/studio/queries';

export const Route = createFileRoute('/_admin/admin/studio/categories')({
  loader: ({ context }) => context.queryClient.ensureQueryData(studioCategoriesQueryOptions),
  head: () => ({ meta: [{ title: 'Studio categories | LunaShare' }] }),
  component: CategoryManager,
});
