import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { TemplateForm } from '@/components/templates/template-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { cn, getTemplateImageUrl } from '@/libs/utils';
import { getAdminTemplateForEdit } from '@/server/fns/admin/templates';
import styles from './edit.module.css';

const templateEditQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminTemplates.edit(id),
    queryFn: () => getAdminTemplateForEdit({ data: { id } }),
  });

export const Route = createFileRoute('/_admin/admin/templates/$templateId/edit')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(templateEditQueryOptions(params.templateId));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Edit Template | LunaShare' }] }),
  component: EditTemplatePage,
});

function EditTemplatePage() {
  const { templateId } = Route.useParams();
  const { data } = useSuspenseQuery(templateEditQueryOptions(templateId));
  const { template, editingModels, globalVariables } = data;

  if (editingModels.length === 0) {
    return (
      <div className={styles.empty}>
        <Card>
          <CardHeader>
            <CardTitle>No Editing Models Available</CardTitle>
          </CardHeader>
          <CardContent className="stack space-4">
            <p className={styles.subtitle}>You need to create at least one editing model before you can edit this template.</p>
            <Link to="/admin/models/editing/new">
              <Button>Create Editing Model</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const linkedGlobalVariables = template.globalVariables.map((tgv) => {
    const gv = tgv.globalVariable;
    let options = gv.options;
    if (gv.type === 'dropdown' && gv.options && tgv.addedOptions) {
      const baseOptions = JSON.parse(JSON.stringify(gv.options));
      const addedOptions = JSON.parse(JSON.stringify(tgv.addedOptions));
      options = [...baseOptions, ...addedOptions];
    }
    return {
      id: `global-${gv.id}`,
      globalVariableId: gv.id,
      name: gv.name,
      label: gv.label,
      type: gv.type,
      required: tgv.required ?? gv.required,
      description: gv.description || undefined,
      defaultValue: gv.defaultValue || undefined,
      options: options ? JSON.parse(JSON.stringify(options)) : undefined,
      enabled: true,
    };
  });

  const initialData = {
    ...template,
    description: template.description || undefined,
    editingModelId: template.editingModelId || undefined,
    variables: [...((template.variables as any) || []), ...linkedGlobalVariables],
    previewImage: template.previewImages ? getTemplateImageUrl(JSON.parse(template.previewImages as string)[0]) : undefined,
    editingModelFieldValues: (template.editingModelFieldValues as Record<string, any>) || {},
  };

  return (
    <div className={styles.root}>
      <div className="margin-bottom-8">
        <h1 className="type-3xl weight-bold">Edit Template</h1>
        <p className={cn(styles.subtitle, 'margin-top-2')}>Edit template details and configuration.</p>
      </div>

      <TemplateForm
        mode="edit"
        initialData={initialData}
        models={editingModels}
        globalVariables={globalVariables}
      />
    </div>
  );
}
