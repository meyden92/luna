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
import styles from './EditingModelManager.module.css';

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
        <CardContent className="pad-6">
          <p className={styles.emptyText}>No editing models configured yet. Add your first model to get started.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className={styles.grid}>
        {models.map((model) => (
          <Card key={model.id}>
            <CardHeader>
              <div className={styles.cardHead}>
                <div className={styles.titleWrap}>
                  <CardTitle className={styles.title}>{model.label}</CardTitle>
                </div>
                <div className={styles.activeToggle}>
                  <span className={styles.activeLabel}>{model.isActive ? 'Active' : 'Inactive'}</span>
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
              {model.description && <p className={styles.description}>{model.description}</p>}
              <p className={styles.meta}>
                <strong>API Model:</strong> {model.apiModelName}
              </p>
              <p
                className={styles.meta}
                data-last="true"
              >
                <strong>Fields:</strong> {model.fields?.length || 0}
              </p>
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  className={styles.editButton}
                  onClick={() => navigate({ to: '/admin/models/editing/$id', params: { id: String(model.id) } })}
                >
                  <Pencil />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(model)}
                >
                  <Trash2 />
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
