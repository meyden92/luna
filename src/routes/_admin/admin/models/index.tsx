import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Pencil, Plus, Sparkles } from 'lucide-react';
import { z } from 'zod';
import EditingModelManager from '@/components/admin/editing-models/EditingModelManager';
import ModelManager from '@/components/admin/models/ModelManager';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { queryKeys } from '@/libs/query-keys';
import { listEditingModels, listGenerationModels } from '@/server/fns/admin/models';

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
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Generation Models</h1>
            <p className="text-sm text-muted-foreground">Manage AI image generation models</p>
          </div>
        </div>
        <div className="flex gap-2">
          {tab === 'generation' ? (
            <Link to="/admin/models/generation/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Model
              </Button>
            </Link>
          ) : (
            <Link to="/admin/models/editing/new">
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Model
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs
        key={tab}
        defaultValue={tab}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger
            value="generation"
            nativeButton={false}
            className="flex items-center gap-2"
            render={
              <Link
                to="/admin/models"
                search={{ tab: 'generation' }}
                role="tab"
              />
            }
          >
            <Sparkles className="w-4 h-4" />
            Generation Models
          </TabsTrigger>
          <TabsTrigger
            value="editing"
            nativeButton={false}
            className="flex items-center gap-2"
            render={
              <Link
                to="/admin/models"
                search={{ tab: 'editing' }}
                role="tab"
              />
            }
          >
            <Pencil className="w-4 h-4" />
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
