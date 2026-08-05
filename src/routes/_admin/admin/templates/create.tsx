import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { TemplateForm } from '@/components/templates/template-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { getTemplateFormData } from '@/server/fns/admin/templates';

const templateFormDataQueryOptions = queryOptions({
  queryKey: queryKeys.adminTemplates.formData,
  queryFn: () => getTemplateFormData(),
});

export const Route = createFileRoute('/_admin/admin/templates/create')({
  loader: ({ context }) => context.queryClient.ensureQueryData(templateFormDataQueryOptions),
  head: () => ({ meta: [{ title: 'Create Template | LunaShare' }] }),
  component: CreateTemplatePage,
});

function CreateTemplatePage() {
  const { data } = useSuspenseQuery(templateFormDataQueryOptions);
  const { editingModels, globalVariables } = data;

  if (editingModels.length === 0) {
    return (
      <div className="max-w-7xl mx-auto pb-8 px-4">
        <Card>
          <CardHeader>
            <CardTitle>No Editing Models Available</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">You need to create at least one editing model before you can create templates.</p>
            <Link to="/admin/models/editing/new">
              <Button>Create Editing Model</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create Template</h1>
        <p className="text-muted-foreground">Create a new generation template with custom variables and prompts.</p>
      </div>
      <TemplateForm
        mode="create"
        models={editingModels}
        globalVariables={globalVariables}
      />
    </div>
  );
}
