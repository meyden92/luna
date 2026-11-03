import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { ModelEditor } from '@/components/admin/studio/ModelEditor';
import { studioCategoriesQueryOptions, studioModelQueryOptions } from '@/components/admin/studio/queries';

export const Route = createFileRoute('/_admin/admin/studio/models/$id')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(studioCategoriesQueryOptions);
    try {
      await context.queryClient.ensureQueryData(studioModelQueryOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Studio model | LunaShare' }] }),
  component: ModelEditorPage,
});

function ModelEditorPage() {
  const { id } = Route.useParams();
  const { data: model } = useSuspenseQuery(studioModelQueryOptions(id));
  const { data: categories } = useSuspenseQuery(studioCategoriesQueryOptions);
  return (
    <ModelEditor
      key={model.updatedAt.toString()}
      model={model}
      categories={categories}
    />
  );
}
