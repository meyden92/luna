import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { studioCategoriesQueryOptions, studioModelsQueryOptions, studioTemplateQueryOptions } from '@/components/admin/studio/queries';
import { TemplateEditor } from '@/components/admin/studio/TemplateEditor';

export const Route = createFileRoute('/_admin/admin/studio/templates/$id')({
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(studioCategoriesQueryOptions),
      context.queryClient.ensureQueryData(studioModelsQueryOptions),
    ]);
    try {
      await context.queryClient.ensureQueryData(studioTemplateQueryOptions(params.id));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Studio template | LunaShare' }] }),
  component: TemplateEditorPage,
});

function TemplateEditorPage() {
  const { id } = Route.useParams();
  const { data: template } = useSuspenseQuery(studioTemplateQueryOptions(id));
  const { data: models } = useSuspenseQuery(studioModelsQueryOptions);
  const { data: categories } = useSuspenseQuery(studioCategoriesQueryOptions);
  return (
    <TemplateEditor
      // A save or Apply remounts it with the stored config. Milliseconds: a write can follow the last one within a second.
      key={template.updatedAt.getTime()}
      draft={{
        id: template.id,
        modelId: template.modelId,
        categoryId: template.categoryId,
        name: template.name,
        description: template.description ?? '',
        isActive: template.isActive,
        fields: template.fields,
        variables: template.variables,
        previews: template.previews.map((preview) => ({ source: 'key', ...preview })),
      }}
      models={models}
      categories={categories}
    />
  );
}
