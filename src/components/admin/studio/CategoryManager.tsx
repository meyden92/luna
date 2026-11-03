import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Pencil, Plus, Shapes, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CategoryIcon } from '@/components/studio/category-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SortableList } from '@/components/ui/sortable-list';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { queryKeys } from '@/libs/query-keys';
import { CATEGORY_ICONS, type CategoryIcon as CategoryIconName } from '@/libs/studio/category-icons';
import { countOf } from '@/libs/studio/format';
import {
  createStudioCategory,
  deleteStudioCategory,
  type listStudioCategories,
  reorderStudioCategories,
  updateStudioCategory,
} from '@/server/fns/admin/studio';
import styles from './CategoryManager.module.css';
import { studioCategoriesQueryOptions } from './queries';

type Category = Awaited<ReturnType<typeof listStudioCategories>>[number];

/** The admin's list of Studio Categories: create, rename, re-icon, reorder by drag and drop, delete. */
export function CategoryManager() {
  const queryClient = useQueryClient();
  const { data: categories } = useSuspenseQuery(studioCategoriesQueryOptions);
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const { confirm, ConfirmationDialog } = useConfirmation<Category>();
  const invalidates = [queryKeys.adminStudio.categories];

  const reorder = useAppMutation(reorderStudioCategories, { invalidates });
  const remove = useAppMutation(deleteStudioCategory, { invalidates, successMessage: 'Category deleted' });

  const onReorder = (ordered: Category[]) => {
    queryClient.setQueryData(queryKeys.adminStudio.categories, ordered);
    reorder.mutate({ ids: ordered.map((category) => category.id) });
  };

  return (
    <div className="stack space-6">
      <div className={styles.header}>
        <div>
          <h1 className="cluster space-2 type-2xl weight-bold">
            <Shapes className={styles.titleIcon} />
            Studio categories
          </h1>
          <p className={styles.muted}>The tasks Users start from in the Studio, in the order of its Category bar.</p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus />
          New category
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Drag a Category by its handle to reorder. A Category can only be deleted once it is empty.</CardDescription>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className={styles.muted}>No categories yet.</p>
          ) : (
            <SortableList
              items={categories}
              getId={(category) => category.id}
              onReorder={onReorder}
              renderItem={(category, handle) => (
                <div
                  className={styles.row}
                  data-testid="studio-category"
                >
                  {handle}
                  <CategoryIcon
                    name={category.icon}
                    className={styles.icon}
                  />
                  <span className={styles.name}>{category.name}</span>
                  <span className={styles.muted}>
                    {countOf(category.modelCount, 'Model')} · {countOf(category.templateCount, 'Template')}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => setEditing(category)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${category.name}`}
                    onClick={() =>
                      confirm({
                        title: `Delete ${category.name}?`,
                        description: 'Users no longer see this Category in the Studio.',
                        data: category,
                        onConfirm: (target) => remove.mutate({ id: target.id }),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              )}
            />
          )}
        </CardContent>
      </Card>

      {editing && (
        <CategoryDialog
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmationDialog />
    </div>
  );
}

function CategoryDialog({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState<CategoryIconName>((category?.icon as CategoryIconName | undefined) ?? 'Image');
  const options = { invalidates: [queryKeys.adminStudio.categories], onSuccess: onClose };
  const create = useAppMutation(createStudioCategory, { ...options, successMessage: 'Category created' });
  const update = useAppMutation(updateStudioCategory, { ...options, successMessage: 'Category saved' });
  const pending = create.isPending || update.isPending;

  const save = () => {
    if (category) update.mutate({ id: category.id, name, icon });
    else create.mutate({ name, icon });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? 'Edit category' : 'New category'}</DialogTitle>
        </DialogHeader>
        <form
          className="stack space-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="stack space-2">
            <Label htmlFor="studio-category-name">Name</Label>
            <Input
              id="studio-category-name"
              value={name}
              maxLength={60}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <fieldset className={styles.iconPicker}>
            <legend className={styles.legend}>Icon</legend>
            {CATEGORY_ICONS.map((candidate) => (
              <Button
                key={candidate}
                type="button"
                variant={candidate === icon ? 'default' : 'outline'}
                size="icon"
                aria-label={candidate}
                aria-pressed={candidate === icon}
                onClick={() => setIcon(candidate)}
              >
                <CategoryIcon name={candidate} />
              </Button>
            ))}
          </fieldset>
          <DialogFooter>
            <Button
              type="submit"
              disabled={!name.trim() || pending}
            >
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
