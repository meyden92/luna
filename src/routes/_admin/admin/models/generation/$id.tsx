import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import ModelForm from '@/components/admin/models/ModelForm';
import { queryKeys } from '@/libs/query-keys';
import { getGenerationModel } from '@/server/fns/admin/models';

const generationModelQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminModels.generationById(id),
    queryFn: () => getGenerationModel({ data: { id } }),
  });

export const Route = createFileRoute('/_admin/admin/models/generation/$id')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(generationModelQueryOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Generation Model | LunaShare' }] }),
  component: EditGenerationModelPage,
});

function EditGenerationModelPage() {
  const { id } = Route.useParams();
  const { data: model } = useSuspenseQuery(generationModelQueryOptions(id));

  return (
    <div className="container pad-y-8">
      <h1 className="type-2xl weight-bold margin-bottom-6">Edit Model</h1>
      <ModelForm model={model} />
    </div>
  );
}
