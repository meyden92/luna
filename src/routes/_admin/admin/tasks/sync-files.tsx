import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Database, FileIcon, FileX, HardDrive, InfoIcon, Plus, RefreshCw, TrashIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { cn, formatSize } from '@/libs/utils';
import { compareAdminSync, deleteAdminDbOnlyFiles } from '@/server/fns/admin/sync';
import { listAdminUsers } from '@/server/fns/admin/users';
import { deleteS3OnlyFiles, insertS3OnlyFilesToDb } from '@/server/fns/sync';
import styles from './sync-files.module.css';

type SyncResult = Awaited<ReturnType<typeof compareAdminSync>>;

const TRIMMED_SIZE_OPTIONS = { trim: true } as const;

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const usersQueryOptions = queryOptions({
  queryKey: queryKeys.admin.users,
  queryFn: () => listAdminUsers(),
});

export const Route = createFileRoute('/_admin/admin/tasks/sync-files')({
  loader: ({ context }) => context.queryClient.ensureQueryData(usersQueryOptions),
  head: () => ({ meta: [{ title: 'Sync Files | LunaShare' }] }),
  component: SyncFilesPage,
});

function SyncFilesPage() {
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [selectedS3Files, setSelectedS3Files] = useState<string[]>([]);
  const [selectedDbFiles, setSelectedDbFiles] = useState<string[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'deleteS3' | 'insertS3' | 'deleteDb'; count: number }>({
    open: false,
    type: 'deleteS3',
    count: 0,
  });

  const { data: users } = useSuspenseQuery(usersQueryOptions);

  const { mutate: performSyncComparison, isPending: isSyncExecuting } = useAppMutation<void, SyncResult>(() => compareAdminSync(), {
    successMessage: 'Sync comparison completed successfully',
    errorMessage: 'An error occurred during sync comparison',
    onSuccess: (data) => {
      setSyncResult(data);
      setSelectedS3Files([]);
      setSelectedDbFiles([]);
    },
  });

  const { mutate: deleteS3FilesAction, isPending: isDeleteS3Executing } = useAppMutation(deleteS3OnlyFiles, {
    successMessage: (data) => `Deleted ${data.deletedCount} S3 files`,
    errorMessage: 'An error occurred while deleting S3 files',
    onSuccess: (data) => {
      if (data.errors.length > 0) toast.error(`${data.errors.length} files failed to delete`);
      performSyncComparison();
    },
  });

  const { mutate: insertS3FilesAction, isPending: isInsertExecuting } = useAppMutation(insertS3OnlyFilesToDb, {
    successMessage: (data) => `Inserted ${data.insertedCount} files into database`,
    errorMessage: 'An error occurred while inserting files',
    onSuccess: (data) => {
      if (data.errors.length > 0) toast.error(`${data.errors.length} files failed to insert`);
      setConfirmDialog({ open: false, type: 'insertS3', count: 0 });
      performSyncComparison();
    },
    onError: () => setConfirmDialog({ open: false, type: 'insertS3', count: 0 }),
  });

  const { mutate: deleteDbFilesAction, isPending: isDeleteDbExecuting } = useAppMutation(deleteAdminDbOnlyFiles, {
    successMessage: (data) => `Deleted ${data.deletedCount} database entries`,
    errorMessage: 'An error occurred while deleting database entries',
    onSuccess: () => {
      setConfirmDialog({ open: false, type: 'deleteDb', count: 0 });
      performSyncComparison();
    },
    onError: () => setConfirmDialog({ open: false, type: 'deleteDb', count: 0 }),
  });

  const handleS3FileToggle = (fileKey: string) =>
    setSelectedS3Files((prev) => (prev.includes(fileKey) ? prev.filter((f) => f !== fileKey) : [...prev, fileKey]));
  const handleDbFileToggle = (fileId: string) =>
    setSelectedDbFiles((prev) => (prev.includes(fileId) ? prev.filter((f) => f !== fileId) : [...prev, fileId]));

  const handleSelectAllS3Files = () => {
    if (!syncResult) return;
    setSelectedS3Files(selectedS3Files.length === syncResult.s3OnlyFiles.length ? [] : syncResult.s3OnlyFiles.map((f) => f.key));
  };
  const handleSelectAllDbFiles = () => {
    if (!syncResult) return;
    setSelectedDbFiles(selectedDbFiles.length === syncResult.dbOnlyFiles.length ? [] : syncResult.dbOnlyFiles.map((f) => f.id));
  };

  const handleConfirmAction = () => {
    if (confirmDialog.type === 'deleteS3') {
      deleteS3FilesAction({ fileKeys: selectedS3Files });
    } else if (confirmDialog.type === 'insertS3') {
      if (!syncResult || !selectedUserId) return;
      const filesToInsert = syncResult.s3OnlyFiles
        .filter((f) => selectedS3Files.includes(f.key))
        .map((f) => ({ key: f.key, fileName: f.fileName, size: f.size, lastModified: new Date(f.lastModified) }));
      insertS3FilesAction({ files: filesToInsert, targetUserId: selectedUserId });
    } else if (confirmDialog.type === 'deleteDb') {
      deleteDbFilesAction({ fileIds: selectedDbFiles });
    }
  };

  const getConfirmDialogContent = () => {
    switch (confirmDialog.type) {
      case 'deleteS3':
        return {
          title: 'Delete S3 Files',
          description: `Are you sure you want to delete ${confirmDialog.count} file(s) from S3 storage? This action cannot be undone and the files will be permanently lost.`,
          actionText: 'Delete Files',
          actionVariant: 'destructive' as const,
        };
      case 'insertS3':
        return {
          title: 'Create Database Entries',
          description: `Create database entries for ${confirmDialog.count} file(s)? The files will be assigned to the selected user.`,
          actionText: 'Create Entries',
          actionVariant: 'default' as const,
        };
      case 'deleteDb':
        return {
          title: 'Delete Database Entries',
          description: `Are you sure you want to delete ${confirmDialog.count} database entries? Files will be marked as deleted but remain in S3 storage.`,
          actionText: 'Delete Entries',
          actionVariant: 'destructive' as const,
        };
    }
  };

  const isAnyActionExecuting = isSyncExecuting || isDeleteS3Executing || isInsertExecuting || isDeleteDbExecuting;
  const dialogContent = getConfirmDialogContent();

  return (
    <div className="container pad-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="type-2xl weight-bold">File Synchronization Management</CardTitle>
          <CardDescription>
            Comprehensive file synchronization between database and S3 storage with detailed analysis and remediation options
          </CardDescription>
        </CardHeader>
        <CardContent className="stack space-6">
          <Alert>
            <InfoIcon className={styles.icon} />
            <AlertTitle>Critical Data Management Tool</AlertTitle>
            <AlertDescription>
              This tool performs comprehensive synchronization analysis between database records and S3 storage.
              <strong className={styles.danger}> Use with extreme caution as actions can permanently delete data.</strong>
              Always verify sync results before taking any destructive actions.
            </AlertDescription>
          </Alert>

          <div className={styles.toolbar}>
            <Button
              onClick={() => performSyncComparison()}
              disabled={isAnyActionExecuting}
              variant="outline"
              className="cluster space-2"
            >
              <RefreshCw className={cn(styles.icon, isSyncExecuting && styles.spinning)} />
              {isSyncExecuting ? 'Analyzing Files...' : 'Run Sync Analysis'}
            </Button>
          </div>

          {syncResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="type-lg cluster space-2">
                    <HardDrive className={styles.iconLg} />
                    Synchronization Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={cn(styles.statGrid, 'margin-bottom-6')}>
                    <div
                      className={styles.statTile}
                      data-tone="success"
                    >
                      <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{syncResult.stats.syncedFiles}</div>
                      <div className={cn(styles.statLabel, 'type-sm')}>Synced Files</div>
                    </div>
                    <div
                      className={styles.statTile}
                      data-tone="info"
                    >
                      <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{syncResult.stats.totalDbFiles}</div>
                      <div className={cn(styles.statLabel, 'type-sm')}>Database Files</div>
                    </div>
                    <div
                      className={styles.statTile}
                      data-tone="accent"
                    >
                      <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{syncResult.stats.totalS3Files}</div>
                      <div className={cn(styles.statLabel, 'type-sm')}>S3 Files</div>
                    </div>
                    <div
                      className={styles.statTile}
                      data-tone="warning"
                    >
                      <div className={cn(styles.statValue, 'type-2xl weight-bold')}>
                        {formatSize(syncResult.stats.totalDbSize, TRIMMED_SIZE_OPTIONS)}
                      </div>
                      <div className={cn(styles.statLabel, 'type-sm')}>Total Size</div>
                    </div>
                  </div>

                  <div className="stack space-3">
                    <div className={cn(styles.rateRow, 'type-sm')}>
                      <span>Synchronization Rate</span>
                      <span className="weight-medium">
                        {Math.round((syncResult.stats.syncedFiles / Math.max(syncResult.stats.totalDbFiles, 1)) * 100)}%
                      </span>
                    </div>
                    <Progress
                      value={(syncResult.stats.syncedFiles / Math.max(syncResult.stats.totalDbFiles, 1)) * 100}
                      className={styles.progress}
                    />
                  </div>
                </CardContent>
              </Card>

              {syncResult.stats.s3OnlyCount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="type-lg cluster space-2">
                      <FileX className={styles.warningIcon} />
                      Files in S3 but Missing from Database
                      <Badge variant="secondary">{syncResult.stats.s3OnlyCount} files</Badge>
                      <Badge variant="outline">{formatSize(syncResult.stats.s3OnlySize, TRIMMED_SIZE_OPTIONS)}</Badge>
                    </CardTitle>
                    <CardDescription>
                      These files exist in S3 storage but have no corresponding database entries. You can either delete them from S3 or
                      create database entries.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="cluster space-2 margin-bottom-4">
                      <Button
                        onClick={handleSelectAllS3Files}
                        variant="outline"
                        size="sm"
                        disabled={isAnyActionExecuting}
                      >
                        {selectedS3Files.length === syncResult.s3OnlyFiles.length ? 'Deselect All' : 'Select All'}
                      </Button>
                      <Button
                        onClick={() => setConfirmDialog({ open: true, type: 'deleteS3', count: selectedS3Files.length })}
                        variant="destructive"
                        size="sm"
                        disabled={selectedS3Files.length === 0 || isAnyActionExecuting}
                        className="cluster space-2"
                      >
                        <TrashIcon className={styles.icon} />
                        {isDeleteS3Executing ? 'Deleting...' : `Delete from S3 (${selectedS3Files.length})`}
                      </Button>
                      <Button
                        onClick={() => setConfirmDialog({ open: true, type: 'insertS3', count: selectedS3Files.length })}
                        variant="default"
                        size="sm"
                        disabled={selectedS3Files.length === 0 || isAnyActionExecuting}
                        className="cluster space-2"
                      >
                        <Plus className={styles.icon} />
                        {isInsertExecuting ? 'Inserting...' : `Insert to DB (${selectedS3Files.length})`}
                      </Button>
                    </div>

                    <div className={styles.fileList}>
                      <div>
                        {syncResult.s3OnlyFiles.map((file) => (
                          <div
                            key={file.key}
                            className={styles.fileRow}
                          >
                            <label className={styles.fileLabel}>
                              <input
                                type="checkbox"
                                checked={selectedS3Files.includes(file.key)}
                                onChange={() => handleS3FileToggle(file.key)}
                                className="margin-top-1"
                              />
                              <div className={styles.fileMain}>
                                <div className="cluster space-2 margin-bottom-1">
                                  <FileIcon className={styles.fileIconInfo} />
                                  <span className="weight-medium type-sm type-truncate">{file.fileName}</span>
                                  <Badge
                                    variant="outline"
                                    className="type-xs"
                                  >
                                    {file.storageClass}
                                  </Badge>
                                </div>
                                <div className={cn(styles.fileMeta, 'type-xs')}>
                                  <div>Size: {formatSize(file.size, TRIMMED_SIZE_OPTIONS)}</div>
                                  <div>Modified: {formatDate(file.lastModified)}</div>
                                  <div className={cn(styles.s3Key, 'type-mono type-xs type-truncate')}>{file.key}</div>
                                </div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {syncResult.stats.dbOnlyCount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="type-lg cluster space-2">
                      <Database className={styles.dangerIcon} />
                      Files in Database but Missing from S3
                      <Badge variant="secondary">{syncResult.stats.dbOnlyCount} files</Badge>
                      <Badge variant="outline">{formatSize(syncResult.stats.dbOnlySize, TRIMMED_SIZE_OPTIONS)}</Badge>
                    </CardTitle>
                    <CardDescription>
                      These files have database entries but are missing from S3 storage. The database entries should be removed as the
                      actual files are no longer accessible.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="cluster space-2 margin-bottom-4">
                      <Button
                        onClick={handleSelectAllDbFiles}
                        variant="outline"
                        size="sm"
                        disabled={isAnyActionExecuting}
                      >
                        {selectedDbFiles.length === syncResult.dbOnlyFiles.length ? 'Deselect All' : 'Select All'}
                      </Button>
                      <Button
                        onClick={() => setConfirmDialog({ open: true, type: 'deleteDb', count: selectedDbFiles.length })}
                        variant="destructive"
                        size="sm"
                        disabled={selectedDbFiles.length === 0 || isAnyActionExecuting}
                        className="cluster space-2"
                      >
                        <Database className={styles.icon} />
                        {isDeleteDbExecuting ? 'Deleting...' : `Delete from DB (${selectedDbFiles.length})`}
                      </Button>
                    </div>

                    <div className={styles.fileList}>
                      <div>
                        {syncResult.dbOnlyFiles.map((file) => (
                          <div
                            key={file.id}
                            className={styles.fileRow}
                          >
                            <label className={styles.fileLabel}>
                              <input
                                type="checkbox"
                                checked={selectedDbFiles.includes(file.id)}
                                onChange={() => handleDbFileToggle(file.id)}
                                className="margin-top-1"
                              />
                              <div className={styles.fileMain}>
                                <div className="cluster space-2 margin-bottom-1">
                                  <Database className={styles.fileIconDanger} />
                                  <span className="weight-medium type-sm type-truncate">{file.title}</span>
                                  <Badge
                                    variant="outline"
                                    className="type-xs"
                                  >
                                    {file.contentType}
                                  </Badge>
                                </div>
                                <div className={cn(styles.fileMeta, 'type-xs')}>
                                  <div>Size: {formatSize(file.size, TRIMMED_SIZE_OPTIONS)}</div>
                                  <div>Created: {formatDate(file.createdAt)}</div>
                                  <div>
                                    DB ID: <span className="type-mono">{file.id}</span>
                                  </div>
                                  <div className={cn(styles.s3Key, 'type-mono type-xs type-truncate')}>
                                    Expected S3 Key: {file.fullS3Key}
                                  </div>
                                </div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {syncResult.stats.s3OnlyCount === 0 && syncResult.stats.dbOnlyCount === 0 && (
                <Card>
                  <CardContent className={styles.emptyState}>
                    <div className="margin-bottom-2">
                      <RefreshCw className={styles.successIcon} />
                    </div>
                    <h3 className={cn(styles.successTitle, 'type-lg weight-semibold margin-bottom-2')}>Perfect Synchronization</h3>
                    <p className={styles.muted}>
                      All files are properly synchronized between the database and S3 storage. No action required.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!syncResult && (
            <Card>
              <CardContent className={styles.emptyState}>
                <RefreshCw className={styles.idleIcon} />
                <h3 className="type-lg weight-semibold margin-bottom-2">Ready for Analysis</h3>
                <p className={styles.muted}>
                  Click "Run Sync Analysis" to compare database records with S3 storage and identify any synchronization issues.
                </p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogContent.title}</AlertDialogTitle>
            <AlertDialogDescription>{dialogContent.description}</AlertDialogDescription>
          </AlertDialogHeader>

          {confirmDialog.type === 'insertS3' && (
            <div className="stack space-2">
              <Label htmlFor="user-select">Assign files to user:</Label>
              <Select
                value={selectedUserId}
                onValueChange={(value) => value && setSelectedUserId(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user) => (
                    <SelectItem
                      key={user.id}
                      value={user.id}
                    >
                      {user.name} ({user.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={confirmDialog.type === 'insertS3' && !selectedUserId}
              className={dialogContent.actionVariant === 'destructive' ? styles.destructiveAction : undefined}
            >
              {dialogContent.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
