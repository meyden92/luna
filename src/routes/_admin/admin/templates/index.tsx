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
import styles from './index.module.css';

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
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="type-3xl weight-bold">Template Management</h1>
          <p className={styles.muted}>Manage image generation templates</p>
        </div>
        <Link to="/admin/templates/create">
          <Button>
            <Plus className={styles.icon} />
            Create Template
          </Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card className={styles.emptyCard}>
          <CardContent>
            <FileImage className={styles.emptyIcon} />
            <h3 className="type-lg weight-semibold margin-bottom-2">No Templates Yet</h3>
            <p className={`${styles.muted} margin-bottom-4`}>
              Create your first template to get started with predefined image generation workflows.
            </p>
            <Link to="/admin/templates/create">
              <Button>
                <Plus className={styles.icon} />
                Create First Template
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className={styles.grid}>
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
                className={styles.card}
              >
                <div className={styles.preview}>
                  {previewImages.length > 0 ? (
                    <div className={styles.previewFrame}>
                      <img
                        src={previewImages[0]}
                        alt={`${template.name} preview`}
                        className={styles.previewImage}
                      />
                    </div>
                  ) : (
                    <div className={styles.previewFallback}>
                      <FileImage className={styles.previewFallbackIcon} />
                    </div>
                  )}

                  <div className={styles.badgeSlotRight}>
                    <Badge
                      variant={template.isActive ? 'default' : 'destructive'}
                      className={`${styles.statusBadge} type-xs weight-medium`}
                      data-active={template.isActive}
                    >
                      {template.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className={styles.badgeSlotLeft}>
                    <Badge
                      variant="outline"
                      className={`${styles.originBadge} type-xs weight-medium`}
                    >
                      Admin
                    </Badge>
                  </div>
                </div>

                <div className={styles.body}>
                  <CardHeader className={styles.cardHeader}>
                    <CardTitle className={`${styles.cardTitle} type-lg weight-bold`}>{template.name}</CardTitle>
                    {template.description && <p className={`${styles.description} type-sm`}>{template.description}</p>}
                  </CardHeader>

                  <CardContent className={styles.cardBody}>
                    <div className="cluster space-2">
                      <Badge
                        variant="outline"
                        className={`${styles.countBadge} weight-medium`}
                      >
                        <FileImage className={styles.iconXs} />
                        {template.inputImageCount} images
                      </Badge>
                      {variables.length > 0 && (
                        <Badge
                          variant="outline"
                          className={`${styles.variableBadge} weight-medium`}
                        >
                          <Sparkles className={styles.iconXs} />
                          {variables.length} variables
                        </Badge>
                      )}
                    </div>

                    <div className={`${styles.meta} type-xs`}>
                      <span className="weight-medium">Created by {template.createdByUser.name}</span>
                      <span className={styles.metaSeparator}>•</span>
                      <span>{new Date(template.createdAt).toLocaleDateString()}</span>
                    </div>

                    <div className={styles.actions}>
                      <Link
                        to="/admin/templates/$templateId/edit"
                        params={{ templateId: template.id }}
                      >
                        <Button
                          size="sm"
                          variant="outline"
                          className={styles.editButton}
                        >
                          <Edit className={styles.editIcon} />
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
