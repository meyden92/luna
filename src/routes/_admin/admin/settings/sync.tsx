import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { FolderX, TrashIcon } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { addAdminSyncExcludedPath, listAdminSyncExcludedPaths, removeAdminSyncExcludedPath } from '@/server/fns/admin/sync';
import styles from './sync.module.css';

const excludedPathsQueryOptions = queryOptions({
  queryKey: queryKeys.admin.syncExcludedPaths,
  queryFn: () => listAdminSyncExcludedPaths(),
});

export const Route = createFileRoute('/_admin/admin/settings/sync')({
  loader: ({ context }) => context.queryClient.ensureQueryData(excludedPathsQueryOptions),
  head: () => ({ meta: [{ title: 'Sync excluded paths | LunaShare' }] }),
  component: SyncExcludedPathsPage,
});

function SyncExcludedPathsPage() {
  const { data: paths } = useSuspenseQuery(excludedPathsQueryOptions);
  const [pattern, setPattern] = useState('');

  const add = useAppMutation(addAdminSyncExcludedPath, {
    successMessage: 'Path excluded',
    invalidates: [queryKeys.admin.syncExcludedPaths],
    onSuccess: () => setPattern(''),
  });
  const remove = useAppMutation(removeAdminSyncExcludedPath, {
    successMessage: 'Path no longer excluded',
    invalidates: [queryKeys.admin.syncExcludedPaths],
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    add.mutate({ pattern });
  };

  return (
    <div className="stack space-6">
      <div>
        <h1 className="cluster space-2 type-2xl weight-bold">
          <FolderX className={styles.titleIcon} />
          Sync excluded paths
        </h1>
        <p className={styles.muted}>
          S3 objects matching one of these patterns are left out of{' '}
          <Link
            to="/admin/tasks/sync-files"
            className={styles.link}
          >
            Sync Files
          </Link>
          . Renditions, Studio Outputs, Template images and Avatars are always left out, wherever they are stored.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Patterns</CardTitle>
          <CardDescription>
            A pattern matches the whole S3 key, and <code>*</code> stands for any characters: <code>templates/*</code>, <code>*.tmp</code>,{' '}
            <code>*/edit-image/*</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="stack space-4">
          <form
            className="stack space-2"
            onSubmit={onSubmit}
          >
            <Label htmlFor="sync-exclude-pattern">New pattern</Label>
            <div className={styles.addForm}>
              <Input
                id="sync-exclude-pattern"
                className="type-mono"
                placeholder="backups/*"
                required
                maxLength={512}
                value={pattern}
                onChange={(event) => setPattern(event.target.value)}
                disabled={add.isPending}
              />
              <Button
                type="submit"
                disabled={add.isPending}
              >
                Exclude
              </Button>
            </div>
          </form>

          {paths.length === 0 ? (
            <p className={styles.muted}>Nothing is excluded; Sync Files compares the whole bucket.</p>
          ) : (
            <ul
              className={styles.list}
              aria-label="Excluded paths"
            >
              {paths.map((path) => (
                <li
                  key={path.id}
                  className={styles.row}
                >
                  <code className="type-mono">{path.pattern}</code>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${path.pattern}`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ id: path.id })}
                  >
                    <TrashIcon />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
