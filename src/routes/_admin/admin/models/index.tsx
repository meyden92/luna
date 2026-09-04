import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Plus, Sparkles } from 'lucide-react';
import { z } from 'zod';
import EditingModelManager from '@/components/admin/editing-models/EditingModelManager';
import ModelManager from '@/components/admin/models/ModelManager';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryKeys } from '@/libs/query-keys';
import { cn } from '@/libs/utils';
import { listEditingModels, listGenerationModels } from '@/server/fns/admin/models';
import styles from './index.module.css';

const generationModelsQueryOptions = queryOptions({
  queryKey: queryKeys.adminModels.generation,
  queryFn: () => listGenerationModels(),
});

const editingModelsQueryOptions = queryOptions({
  queryKey: queryKeys.adminModels.editing,
  queryFn: () => listEditingModels(),
});

const searchSchema = z.object({
  tab: z.enum(['generation', 'editing']).default('generation'),
});

export const Route = createFileRoute('/_admin/admin/models/')({
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(generationModelsQueryOptions),
      context.queryClient.ensureQueryData(editingModelsQueryOptions),
    ]);
  },
  head: () => ({ meta: [{ title: 'Models | LunaShare' }] }),
  component: AdminModelsPage,
});

function AdminModelsPage() {
  const { tab } = Route.useSearch();
  const { data: generationModels } = useSuspenseQuery(generationModelsQueryOptions);
  const { data: editingModels } = useSuspenseQuery(editingModelsQueryOptions);

  return (
    <div className="container pad-y-8">
      <div className={styles.header}>
        <div className={styles.headingRow}>
          <div className={styles.iconTile}>
            <Sparkles className={styles.icon} />
          </div>
          <div>
            <h1 className="type-2xl weight-bold">Generation Models</h1>
            <p className={cn(styles.subtitle, 'type-sm')}>Manage AI image generation models</p>
          </div>
        </div>
        <div className="cluster space-2">
          {tab === 'generation' ? (
            <Link to="/admin/models/generation/new">
              <Button>
                <Plus className={styles.addIcon} />
                Add Model
              </Button>
            </Link>
          ) : (
            <Link to="/admin/models/editing/new">
              <Button>
                <Plus className={styles.addIcon} />
                Add Model
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs
        key={tab}
        defaultValue={tab}
      >
        <TabsList className="margin-bottom-4">
          <TabsTrigger
            value="generation"
            nativeButton={false}
            className={styles.tabTrigger}
            render={
              <Link
                to="/admin/models"
                search={{ tab: 'generation' }}
                role="tab"
              />
            }
          >
            <Sparkles className={styles.tabIcon} />
            Generation Models
          </TabsTrigger>
          <TabsTrigger
            value="editing"
            nativeButton={false}
            className={styles.tabTrigger}
            render={
              <Link
                to="/admin/models"
                search={{ tab: 'editing' }}
                role="tab"
              />
            }
          >
            <Pencil className={styles.tabIcon} />
            Editing Models
          </TabsTrigger>
        </TabsList>
        <TabsContent value="generation">
          <ModelManager models={generationModels} />
        </TabsContent>
        <TabsContent value="editing">
          <EditingModelManager models={editingModels} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
