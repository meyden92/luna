import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Edit, FileImage, Plus, Sparkles } from 'lucide-react';
import { DeleteTemplateButton } from '@/components/templates/delete-template-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { getTemplateImageUrl } from '@/libs/utils';
import { listAdminTemplates } from '@/server/fns/admin/templates';

const templatesQueryOptions = queryOptions({
  queryKey: queryKeys.adminTemplates.list,
  queryFn: () => listAdminTemplates(),
});

export const Route = createFileRoute('/_admin/admin/templates/')({
  loader: ({ context }) => context.queryClient.ensureQueryData(templatesQueryOptions),
  head: () => ({ meta: [{ title: 'Templates | LunaShare' }] }),
  component: AdminTemplatesPage,
});

function AdminTemplatesPage() {
  const { data: templates } = useSuspenseQuery(templatesQueryOptions);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Template Management</h1>
          <p className="text-muted-foreground">Manage image generation templates</p>
        </div>
        <Link to="/admin/templates/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FileImage className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Templates Yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first template to get started with predefined image generation workflows.
            </p>
            <Link to="/admin/templates/create">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create First Template
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => {
            let previewImages: string[] = [];
            try {
              const rawImages = template.previewImages ? JSON.parse(template.previewImages as string) : [];
              previewImages = rawImages.map((img: string) => getTemplateImageUrl(img));
            } catch {
              previewImages = [];
            }
            const variables = Array.isArray(template.variables) ? template.variables : [];

            return (
              <Card
                key={template.id}
                className="group relative overflow-hidden bg-gradient-to-br from-background via-background to-muted/20 border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col h-full"
              >
                <div className="relative h-52 bg-gradient-to-br from-muted via-muted/80 to-muted/60 overflow-hidden">
                  {previewImages.length > 0 ? (
                    <div className="relative w-full h-full">
                      <img
                        src={previewImages[0]}
                        alt={`${template.name} preview`}
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300 ease-out"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10">
                      <div className="relative">
                        <FileImage className="w-16 h-16 text-primary/60" />
                        <div className="absolute inset-0 w-16 h-16 bg-primary/10 rounded-full blur-xl" />
                      </div>
                    </div>
                  )}

                  <div className="absolute top-3 right-3 z-20">
                    <Badge
                      variant={template.isActive ? 'default' : 'destructive'}
                      className={`text-xs backdrop-blur-sm border-0 shadow-sm font-medium ${
                        template.isActive ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-red-500 text-white hover:bg-red-600'
                      }`}
                    >
                      {template.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="absolute top-3 left-3 z-20">
                    <Badge
                      variant="outline"
                      className="text-xs bg-background/95 backdrop-blur-sm border-0 shadow-sm font-medium"
                    >
                      Admin
                    </Badge>
                  </div>
                </div>

                <div className="relative z-20 flex flex-col flex-1">
                  <CardHeader className="pb-3 pt-4 flex-shrink-0">
                    <CardTitle className="text-lg font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent group-hover:from-primary group-hover:to-primary/80 transition-all duration-300">
                      {template.name}
                    </CardTitle>
                    {template.description && (
                      <p className="text-sm text-muted-foreground/90 line-clamp-2 leading-relaxed">{template.description}</p>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4 pt-0 flex flex-col flex-1">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant="outline"
                        className="bg-primary/10 border-primary/20 text-primary font-medium"
                      >
                        <FileImage className="w-3 h-3 mr-1" />
                        {template.inputImageCount} images
                      </Badge>
                      {variables.length > 0 && (
                        <Badge
                          variant="outline"
                          className="bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400 font-medium"
                        >
                          <Sparkles className="w-3 h-3 mr-1" />
                          {variables.length} variables
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                      <span className="font-medium">Created by {template.createdByUser.name}</span>
                      <span className="mx-2">•</span>
                      <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className="flex gap-2 pt-2 mt-auto">
                      <Link
                        to="/admin/templates/$templateId/edit"
                        params={{ templateId: template.id }}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className="hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all duration-200"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      <DeleteTemplateButton
                        templateId={template.id}
                        templateName={template.name}
                      />
                    </div>
                  </CardContent>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
