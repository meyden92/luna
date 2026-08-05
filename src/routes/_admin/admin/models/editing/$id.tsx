import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import EditingModelForm from '@/components/admin/editing-models/EditingModelForm';
import { queryKeys } from '@/libs/query-keys';
import { getEditingModel } from '@/server/fns/admin/models';

const editingModelQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminModels.editingById(id),
    queryFn: () => getEditingModel({ data: { id } }),
  });

export const Route = createFileRoute('/_admin/admin/models/editing/$id')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(editingModelQueryOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Editing Model | LunaShare' }] }),
  component: EditEditingModelPage,
});

function EditEditingModelPage() {
  const { id } = Route.useParams();
  const { data: model } = useSuspenseQuery(editingModelQueryOptions(id));

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Edit Editing Model</h1>
      <EditingModelForm model={model} />
    </div>
  );
}
