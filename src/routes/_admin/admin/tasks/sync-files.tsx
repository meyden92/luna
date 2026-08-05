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
import { formatSize } from '@/libs/utils';
import { compareAdminSync, deleteAdminDbOnlyFiles } from '@/server/fns/admin/sync';
import { listAdminUsers } from '@/server/fns/admin/users';
import { deleteS3OnlyFiles, insertS3OnlyFilesToDb } from '@/server/fns/sync';

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
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">File Synchronization Management</CardTitle>
          <CardDescription>
            Comprehensive file synchronization between database and S3 storage with detailed analysis and remediation options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertTitle>Critical Data Management Tool</AlertTitle>
            <AlertDescription>
              This tool performs comprehensive synchronization analysis between database records and S3 storage.
              <strong className="text-destructive"> Use with extreme caution as actions can permanently delete data.</strong>
              Always verify sync results before taking any destructive actions.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={() => performSyncComparison()}
              disabled={isAnyActionExecuting}
              variant="outline"
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncExecuting ? 'animate-spin' : ''}`} />
              {isSyncExecuting ? 'Analyzing Files...' : 'Run Sync Analysis'}
            </Button>
          </div>

          {syncResult && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <HardDrive className="h-5 w-5" />
                    Synchronization Statistics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">{syncResult.stats.syncedFiles}</div>
                      <div className="text-sm text-muted-foreground">Synced Files</div>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{syncResult.stats.totalDbFiles}</div>
                      <div className="text-sm text-muted-foreground">Database Files</div>
                    </div>
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{syncResult.stats.totalS3Files}</div>
                      <div className="text-sm text-muted-foreground">S3 Files</div>
                    </div>
                    <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                        {formatSize(syncResult.stats.totalDbSize, TRIMMED_SIZE_OPTIONS)}
                      </div>
                      <div className="text-sm text-muted-foreground">Total Size</div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Synchronization Rate</span>
                      <span className="font-medium">
                        {Math.round((syncResult.stats.syncedFiles / Math.max(syncResult.stats.totalDbFiles, 1)) * 100)}%
                      </span>
                    </div>
                    <Progress
                      value={(syncResult.stats.syncedFiles / Math.max(syncResult.stats.totalDbFiles, 1)) * 100}
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>

              {syncResult.stats.s3OnlyCount > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileX className="h-5 w-5 text-yellow-600" />
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
                    <div className="flex flex-wrap gap-2 mb-4">
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
                        className="flex items-center gap-2"
                      >
                        <TrashIcon className="h-4 w-4" />
                        {isDeleteS3Executing ? 'Deleting...' : `Delete from S3 (${selectedS3Files.length})`}
                      </Button>
                      <Button
                        onClick={() => setConfirmDialog({ open: true, type: 'insertS3', count: selectedS3Files.length })}
                        variant="default"
                        size="sm"
                        disabled={selectedS3Files.length === 0 || isAnyActionExecuting}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {isInsertExecuting ? 'Inserting...' : `Insert to DB (${selectedS3Files.length})`}
                      </Button>
                    </div>

                    <div className="max-h-96 overflow-y-auto border rounded-lg">
                      <div className="divide-y">
                        {syncResult.s3OnlyFiles.map((file) => (
                          <div
                            key={file.key}
                            className="p-3 hover:bg-muted/50 transition-colors"
                          >
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedS3Files.includes(file.key)}
                                onChange={() => handleS3FileToggle(file.key)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <FileIcon className="h-4 w-4 text-blue-600 flex-shrink-0" />
                                  <span className="font-medium text-sm truncate">{file.fileName}</span>
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {file.storageClass}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                  <div>Size: {formatSize(file.size, TRIMMED_SIZE_OPTIONS)}</div>
                                  <div>Modified: {formatDate(file.lastModified)}</div>
                                  <div className="font-mono text-xs bg-muted px-2 py-1 rounded truncate">{file.key}</div>
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
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Database className="h-5 w-5 text-red-600" />
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
                    <div className="flex flex-wrap gap-2 mb-4">
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
                        className="flex items-center gap-2"
                      >
                        <Database className="h-4 w-4" />
                        {isDeleteDbExecuting ? 'Deleting...' : `Delete from DB (${selectedDbFiles.length})`}
                      </Button>
                    </div>

                    <div className="max-h-96 overflow-y-auto border rounded-lg">
                      <div className="divide-y">
                        {syncResult.dbOnlyFiles.map((file) => (
                          <div
                            key={file.id}
                            className="p-3 hover:bg-muted/50 transition-colors"
                          >
                            <label className="flex items-start gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedDbFiles.includes(file.id)}
                                onChange={() => handleDbFileToggle(file.id)}
                                className="mt-1"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Database className="h-4 w-4 text-red-600 flex-shrink-0" />
                                  <span className="font-medium text-sm truncate">{file.title}</span>
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {file.contentType}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-1">
                                  <div>Size: {formatSize(file.size, TRIMMED_SIZE_OPTIONS)}</div>
                                  <div>Created: {formatDate(file.createdAt)}</div>
                                  <div>
                                    DB ID: <span className="font-mono">{file.id}</span>
                                  </div>
                                  <div className="font-mono text-xs bg-muted px-2 py-1 rounded truncate">
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
                  <CardContent className="text-center py-8">
                    <div className="text-green-600 dark:text-green-400 mb-2">
                      <RefreshCw className="h-12 w-12 mx-auto mb-4" />
                    </div>
                    <h3 className="text-lg font-semibold text-green-600 dark:text-green-400 mb-2">Perfect Synchronization</h3>
                    <p className="text-muted-foreground">
                      All files are properly synchronized between the database and S3 storage. No action required.
                    </p>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!syncResult && (
            <Card>
              <CardContent className="text-center py-8">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Ready for Analysis</h3>
                <p className="text-muted-foreground">
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
            <div className="space-y-2">
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
              className={dialogContent.actionVariant === 'destructive' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {dialogContent.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
