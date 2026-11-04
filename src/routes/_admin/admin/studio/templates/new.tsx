import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { z } from 'zod';
import { studioCategoriesQueryOptions, studioModelsQueryOptions, templateDraftQueryOptions } from '@/components/admin/studio/queries';
import { TemplateEditor } from '@/components/admin/studio/TemplateEditor';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

/** `from` is a Generation id: *Save as Template* starts the new Template from it. */
export const Route = createFileRoute('/_admin/admin/studio/templates/new')({
  validateSearch: z.object({ from: z.string().optional() }),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(studioCategoriesQueryOptions),
      context.queryClient.ensureQueryData(studioModelsQueryOptions),
    ]),
  head: () => ({ meta: [{ title: 'New studio template | LunaShare' }] }),
  component: NewTemplatePage,
});

const EMPTY = { name: '', description: '', isActive: true, fields: [], variables: [], previews: [] };

function NewTemplatePage() {
  const { from } = Route.useSearch();
  const { data: models } = useSuspenseQuery(studioModelsQueryOptions);
  const { data: categories } = useSuspenseQuery(studioCategoriesQueryOptions);
  const draft = useQuery({ ...templateDraftQueryOptions(from ?? ''), enabled: Boolean(from) });

  if (!from) {
    return (
      <TemplateEditor
        draft={{ ...EMPTY, modelId: null, categoryId: null }}
        models={models}
        categories={categories}
      />
    );
  }
  if (draft.isPending) return <Spinner />;
  if (draft.isError) {
    return (
      <div className="stack space-4">
        <h1 className="type-2xl weight-bold">New template</h1>
        <Alert variant="destructive">
          <AlertDescription>{draft.error.message}</AlertDescription>
        </Alert>
        <Link to="/admin/studio/templates/new">Start an empty Template instead</Link>
      </div>
    );
  }
  const { preview, ...values } = draft.data;
  return (
    <TemplateEditor
      draft={{
        ...EMPTY,
        ...values,
        previews: preview ? [{ source: 'output', outputId: preview.outputId, url: preview.url }] : [],
      }}
      models={models}
      categories={categories}
    />
  );
}
