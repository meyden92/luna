import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import type { listEditingModels } from '@/server/fns/admin/models';
import { deleteEditingModel, setEditingModelActive } from '@/server/fns/admin/models';

type EditingModel = Awaited<ReturnType<typeof listEditingModels>>[number];

interface EditingModelManagerProps {
  models: EditingModel[];
}

export default function EditingModelManager({ models }: EditingModelManagerProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<EditingModel | null>(null);

  const { mutate: deleteModel, isPending: isDeleting } = useAppMutation(deleteEditingModel, {
    successMessage: 'Editing model deleted successfully',
    errorMessage: 'Failed to delete editing model',
    invalidates: [queryKeys.adminModels.editing],
    onSuccess: () => {
      setDeleteDialogOpen(false);
      setModelToDelete(null);
    },
  });

  const {
    mutate: toggleActive,
    isPending: isTogglingActive,
    variables: activeToggleVariables,
  } = useAppMutation(setEditingModelActive, {
    successMessage: (data) => `${data.model.label} ${data.model.isActive ? 'activated' : 'deactivated'}`,
    errorMessage: 'Failed to update editing model status',
    invalidates: [queryKeys.adminModels.editing],
    onSuccess: ({ model }) => {
      queryClient.setQueryData<EditingModel[]>(queryKeys.adminModels.editing, (current) =>
        current?.map((item) => (item.id === model.id ? model : item)),
      );
      queryClient.setQueryData(queryKeys.adminModels.editingById(model.id), model);
    },
  });

  const handleDelete = async (model: EditingModel) => {
    setModelToDelete(model);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!modelToDelete) return;
    deleteModel({ id: modelToDelete.id });
  };

  if (models.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No editing models configured yet. Add your first model to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {models.map((model) => (
          <Card key={model.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg">{model.label}</CardTitle>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{model.isActive ? 'Active' : 'Inactive'}</span>
                  <Switch
                    checked={model.isActive}
                    disabled={isTogglingActive && activeToggleVariables?.id === model.id}
                    onCheckedChange={(isActive) => toggleActive({ id: model.id, isActive })}
                    aria-label={`${model.isActive ? 'Deactivate' : 'Activate'} ${model.label}`}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {model.description && <p className="text-sm text-muted-foreground mb-3">{model.description}</p>}
              <p className="text-xs text-muted-foreground mb-3">
                <strong>API Model:</strong> {model.apiModelName}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                <strong>Fields:</strong> {model.fields?.length || 0}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate({ to: '/admin/models/editing/$id', params: { id: String(model.id) } })}
                >
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(model)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Editing Model</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{modelToDelete?.label}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
