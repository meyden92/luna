import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Database, Eye, FileIcon, InfoIcon, RefreshCw, RotateCcw, TrashIcon, User } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { queryKeys } from '@/libs/query-keys';
import { getCdnUrl } from '@/libs/runtime-config';
import { cn, formatSize } from '@/libs/utils';
import { listDeletedFiles, permanentlyDeleteFiles, restoreDeletedFiles } from '@/server/fns/admin/deleted-files';
import styles from './deleted-files.module.css';

type DeletedFile = Awaited<ReturnType<typeof listDeletedFiles>>[number];

type GroupedDeletedFiles = {
  userId: string;
  userName: string;
  userEmail: string;
  files: DeletedFile[];
  totalSize: number;
};

const DELETED_FILES_QUERY_KEY = queryKeys.admin.deletedFiles;

const TRIMMED_SIZE_OPTIONS = { trim: true } as const;

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const canPreviewFile = (contentType: string) =>
  contentType.startsWith('image/') ||
  contentType.startsWith('video/') ||
  contentType.startsWith('audio/') ||
  contentType.startsWith('text/') ||
  contentType === 'application/json' ||
  contentType === 'application/xml';

const getFilePreviewUrl = (file: DeletedFile) => `${getCdnUrl()}/${file.ownerId}/${file.url}`;

function TextFileContent({ fileUrl }: { fileUrl: string }) {
  const [content, setContent] = useState<string>('Loading...');

  useEffect(() => {
    fetch(fileUrl)
      .then((response) => {
        if (!response.ok) throw new Error('Failed to fetch file');
        return response.text();
      })
      .then((text) => {
        const maxLength = 1000;
        setContent(text.length > maxLength ? `${text.substring(0, maxLength)}\n... [Content truncated]` : text);
      })
      .catch(() => setContent('Failed to load file content. File may not be accessible.'));
  }, [fileUrl]);

  return <>{content}</>;
}

function FilePreviewContent({ file }: { file: DeletedFile }) {
  const fileUrl = getFilePreviewUrl(file);
  const { contentType } = file;

  if (contentType.startsWith('image/')) {
    return (
      <div className={styles.preview}>
        <img
          src={fileUrl}
          alt={file.title}
          className={styles.previewMedia}
        />
        <div className={cn(styles.previewNote, 'type-xs margin-top-2')}>Image preview may not work for deleted files in S3</div>
      </div>
    );
  }
  if (contentType.startsWith('video/')) {
    return (
      <div className={styles.preview}>
        <video
          src={fileUrl}
          controls
          className={styles.previewMedia}
          preload="metadata"
        >
          <track
            kind="captions"
            src=""
            srcLang="en"
            label="English captions"
            default
          />
          Your browser does not support the video element.
        </video>
        <div className={cn(styles.previewNote, 'type-xs margin-top-2')}>Video preview may not work for deleted files in S3</div>
      </div>
    );
  }
  if (contentType.startsWith('audio/')) {
    return (
      <div className={styles.preview}>
        <audio
          src={fileUrl}
          controls
          className={styles.previewAudio}
          preload="metadata"
        >
          <track
            kind="captions"
            src=""
            srcLang="en"
            label="English captions"
            default
          />
          Your browser does not support the audio element.
        </audio>
        <div className={cn(styles.previewNote, 'type-xs margin-top-2')}>Audio preview may not work for deleted files in S3</div>
      </div>
    );
  }
  if (contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml') {
    return (
      <div className={styles.previewScroll}>
        <div className="type-sm weight-medium margin-bottom-2">Text File Preview:</div>
        <pre className={cn(styles.previewText, 'type-xs type-mono')}>
          <TextFileContent fileUrl={fileUrl} />
        </pre>
        <div className={cn(styles.previewNote, 'type-xs margin-top-2')}>Text preview may not work for deleted files in S3</div>
      </div>
    );
  }
  return (
    <div className={styles.previewEmpty}>
      <div className="type-sm weight-medium margin-bottom-2">Preview not available</div>
      <div className="type-xs">File type "{contentType}" cannot be previewed inline.</div>
    </div>
  );
}

function groupDeletedFiles(files: DeletedFile[]): GroupedDeletedFiles[] {
  const grouped: Record<string, GroupedDeletedFiles> = {};
  for (const file of files) {
    const userId = file.owner.id;
    if (!grouped[userId]) {
      grouped[userId] = { userId, userName: file.owner.name, userEmail: file.owner.email, files: [], totalSize: 0 };
    }
    grouped[userId].files.push(file);
    grouped[userId].totalSize += file.size;
  }
  for (const group of Object.values(grouped)) {
    group.files.sort((a, b) => new Date(b.deletedAt || b.createdAt).getTime() - new Date(a.deletedAt || a.createdAt).getTime());
  }
  return Object.values(grouped).sort((a, b) => b.totalSize - a.totalSize);
}

export const Route = createFileRoute('/_admin/admin/tasks/deleted-files')({
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: DELETED_FILES_QUERY_KEY, queryFn: () => listDeletedFiles() }),
  head: () => ({ meta: [{ title: 'Deleted Files | LunaShare' }] }),
  component: DeletedFilesPage,
});

function DeletedFilesPage() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<DeletedFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: 'delete' | 'restore';
    count: number;
    totalSize: number;
    fileIds: string[];
  }>({ open: false, type: 'delete', count: 0, totalSize: 0, fileIds: [] });

  const {
    data: deletedFilesData,
    isFetching: isFetchExecuting,
    refetch: refetchDeletedFiles,
  } = useSuspenseQuery({
    queryKey: DELETED_FILES_QUERY_KEY,
    queryFn: () => listDeletedFiles(),
  });

  const groupedFiles = groupDeletedFiles(deletedFilesData);

  const { mutate: deleteFilesAction, isPending: isDeleteExecuting } = useAppMutation(permanentlyDeleteFiles, {
    invalidates: [DELETED_FILES_QUERY_KEY],
    successMessage: (data) => `Permanently deleted ${data.deletedCount} files and ${data.s3DeletedCount} S3 objects`,
    errorMessage: 'An error occurred while permanently deleting files',
    onSuccess: (data) => {
      if (data.errors.length > 0) toast.error(`${data.errors.length} files had errors during deletion`);
      setConfirmDialog({ open: false, type: 'delete', count: 0, totalSize: 0, fileIds: [] });
      setSelectedFiles([]);
    },
    onError: () => setConfirmDialog({ open: false, type: 'delete', count: 0, totalSize: 0, fileIds: [] }),
  });

  const { mutate: restoreFilesAction, isPending: isRestoreExecuting } = useAppMutation(restoreDeletedFiles, {
    invalidates: [DELETED_FILES_QUERY_KEY],
    successMessage: (data) => `Restored ${data.restoredCount} files`,
    errorMessage: 'An error occurred while restoring files',
    onSuccess: () => {
      setConfirmDialog({ open: false, type: 'restore', count: 0, totalSize: 0, fileIds: [] });
      setSelectedFiles([]);
    },
    onError: () => setConfirmDialog({ open: false, type: 'restore', count: 0, totalSize: 0, fileIds: [] }),
  });

  const handleFileToggle = (fileId: string) =>
    setSelectedFiles((prev) => (prev.includes(fileId) ? prev.filter((f) => f !== fileId) : [...prev, fileId]));

  const handleSelectAllUserFiles = (userId: string) => {
    const userGroup = groupedFiles.find((g) => g.userId === userId);
    if (!userGroup) return;
    const userFileIds = userGroup.files.map((f) => f.id);
    const allSelected = userFileIds.every((id) => selectedFiles.includes(id));
    if (allSelected) {
      setSelectedFiles((prev) => prev.filter((id) => !userFileIds.includes(id)));
    } else {
      setSelectedFiles((prev) => [...new Set([...prev, ...userFileIds])]);
    }
  };

  const handleSelectAllFiles = () => {
    const allFileIds = groupedFiles.flatMap((g) => g.files.map((f) => f.id));
    setSelectedFiles(selectedFiles.length === allFileIds.length ? [] : allFileIds);
  };

  const openConfirm = (type: 'delete' | 'restore') => {
    if (selectedFiles.length === 0) return;
    const selectedData = groupedFiles.flatMap((g) => g.files).filter((f) => selectedFiles.includes(f.id));
    const totalSize = selectedData.reduce((sum, f) => sum + f.size, 0);
    setConfirmDialog({ open: true, type, count: selectedFiles.length, totalSize, fileIds: selectedFiles });
  };

  const handleIndividualAction = (fileId: string, file: DeletedFile, action: 'delete' | 'restore') =>
    setConfirmDialog({ open: true, type: action, count: 1, totalSize: file.size, fileIds: [fileId] });

  const handleConfirmAction = () => {
    if (confirmDialog.type === 'delete') deleteFilesAction({ fileIds: confirmDialog.fileIds });
    else restoreFilesAction({ fileIds: confirmDialog.fileIds });
  };

  const toggleUserExpanded = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) newExpanded.delete(userId);
    else newExpanded.add(userId);
    setExpandedUsers(newExpanded);
  };

  const isAnyActionExecuting = isFetchExecuting || isDeleteExecuting || isRestoreExecuting;
  const totalDeletedFiles = groupedFiles.reduce((sum, g) => sum + g.files.length, 0);
  const totalDeletedSize = groupedFiles.reduce((sum, g) => sum + g.totalSize, 0);
  const selectedFilesSize = groupedFiles
    .flatMap((g) => g.files)
    .filter((f) => selectedFiles.includes(f.id))
    .reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="container pad-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="type-2xl weight-bold">Deleted Files Management</CardTitle>
          <CardDescription>
            Manage soft-deleted files grouped by user with options for permanent deletion from database and S3 storage
          </CardDescription>
        </CardHeader>
        <CardContent className="stack space-6">
          <Alert>
            <InfoIcon className={styles.icon} />
            <AlertTitle>Permanent Deletion Tool</AlertTitle>
            <AlertDescription>
              This tool manages soft-deleted files that are marked as deleted but still exist in S3 storage.
              <strong className={styles.danger}> Permanent deletion cannot be undone.</strong>
              Files will be removed from both the database and S3 storage permanently.
            </AlertDescription>
          </Alert>

          <div className={styles.toolbar}>
            <Button
              onClick={() => refetchDeletedFiles()}
              disabled={isAnyActionExecuting}
              variant="outline"
              className="cluster space-2"
            >
              <RefreshCw className={cn(styles.icon, isFetchExecuting && styles.spinning)} />
              {isFetchExecuting ? 'Loading...' : 'Refresh Deleted Files'}
            </Button>

            {totalDeletedFiles > 0 && (
              <div className={styles.actions}>
                <Button
                  onClick={handleSelectAllFiles}
                  variant="outline"
                  size="sm"
                  disabled={isAnyActionExecuting}
                >
                  {selectedFiles.length === groupedFiles.flatMap((g) => g.files).length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button
                  onClick={() => openConfirm('restore')}
                  variant="outline"
                  size="sm"
                  disabled={selectedFiles.length === 0 || isAnyActionExecuting}
                  className="cluster space-2"
                >
                  <RotateCcw className={styles.icon} />
                  {isRestoreExecuting ? 'Restoring...' : `Restore (${selectedFiles.length})`}
                </Button>
                <Button
                  onClick={() => openConfirm('delete')}
                  variant="destructive"
                  size="sm"
                  disabled={selectedFiles.length === 0 || isAnyActionExecuting}
                  className="cluster space-2"
                >
                  <TrashIcon className={styles.icon} />
                  {isDeleteExecuting ? 'Deleting...' : `Permanently Delete (${selectedFiles.length})`}
                </Button>
              </div>
            )}
          </div>

          {totalDeletedFiles > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="type-lg cluster space-2">
                  <Database className={styles.iconLg} />
                  Deleted Files Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.statGrid}>
                  <div
                    className={styles.statTile}
                    data-tone="danger"
                  >
                    <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{totalDeletedFiles}</div>
                    <div className={cn(styles.statLabel, 'type-sm')}>Total Deleted Files</div>
                  </div>
                  <div
                    className={styles.statTile}
                    data-tone="info"
                  >
                    <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{groupedFiles.length}</div>
                    <div className={cn(styles.statLabel, 'type-sm')}>Affected Users</div>
                  </div>
                  <div
                    className={styles.statTile}
                    data-tone="warning"
                  >
                    <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{formatSize(totalDeletedSize, TRIMMED_SIZE_OPTIONS)}</div>
                    <div className={cn(styles.statLabel, 'type-sm')}>Total Size</div>
                  </div>
                  <div
                    className={styles.statTile}
                    data-tone="accent"
                  >
                    <div className={cn(styles.statValue, 'type-2xl weight-bold')}>{selectedFiles.length}</div>
                    <div className={cn(styles.statLabel, 'type-sm')}>Selected Files</div>
                  </div>
                </div>
                {selectedFiles.length > 0 && (
                  <div className={cn(styles.selectionNote, 'margin-top-4')}>
                    <p className="type-sm weight-medium">
                      Selected: {selectedFiles.length} files ({formatSize(selectedFilesSize, TRIMMED_SIZE_OPTIONS)})
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {groupedFiles.length > 0 ? (
            <div className="stack space-4">
              {groupedFiles.map((userGroup) => {
                const userFileIds = userGroup.files.map((f) => f.id);
                const allUserFilesSelected = userFileIds.every((id) => selectedFiles.includes(id));
                const someUserFilesSelected = userFileIds.some((id) => selectedFiles.includes(id));

                return (
                  <Card key={userGroup.userId}>
                    <CardHeader
                      className={styles.groupHeader}
                      onClick={() => toggleUserExpanded(userGroup.userId)}
                    >
                      <div className={styles.groupRow}>
                        <div className="cluster space-3">
                          <User className={styles.iconLg} />
                          <div>
                            <CardTitle className="type-lg">{userGroup.userName}</CardTitle>
                            <CardDescription>{userGroup.userEmail}</CardDescription>
                          </div>
                        </div>
                        <div className="cluster space-4">
                          <div className={styles.groupMeta}>
                            <div className="cluster space-2">
                              <Badge variant="secondary">{userGroup.files.length} files</Badge>
                              <Badge variant="outline">{formatSize(userGroup.totalSize, TRIMMED_SIZE_OPTIONS)}</Badge>
                            </div>
                            <div className={cn(styles.metaHint, 'type-xs margin-top-1')}>
                              {someUserFilesSelected && `${userFileIds.filter((id) => selectedFiles.includes(id)).length} selected`}
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectAllUserFiles(userGroup.userId);
                            }}
                            disabled={isAnyActionExecuting}
                          >
                            {allUserFilesSelected ? 'Deselect All' : 'Select All'}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    {expandedUsers.has(userGroup.userId) && (
                      <CardContent className={styles.groupBody}>
                        <div className={styles.fileList}>
                          <div>
                            {userGroup.files.map((file) => (
                              <div
                                key={file.id}
                                className={styles.fileRow}
                              >
                                <div className={styles.fileRowInner}>
                                  <input
                                    type="checkbox"
                                    checked={selectedFiles.includes(file.id)}
                                    onChange={() => handleFileToggle(file.id)}
                                    className="margin-top-1"
                                  />
                                  <div className={styles.fileMain}>
                                    <div className="cluster space-2 margin-bottom-1">
                                      <FileIcon className={styles.fileIcon} />
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
                                      <div>Uploaded: {formatDate(file.createdAt)}</div>
                                      <div>Deleted: {file.deletedAt ? formatDate(file.deletedAt) : 'Unknown'}</div>
                                      <div className={cn(styles.s3Key, 'type-mono type-xs type-truncate')}>
                                        S3 Key: {file.ownerId}/{file.url}
                                      </div>
                                    </div>
                                  </div>
                                  <div className={styles.rowActions}>
                                    {canPreviewFile(file.contentType) ? (
                                      <Popover
                                        open={previewOpen && previewFile?.id === file.id}
                                        onOpenChange={(open) => {
                                          if (!open) {
                                            setPreviewOpen(false);
                                            setPreviewFile(null);
                                          }
                                        }}
                                      >
                                        <PopoverTrigger
                                          render={
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => {
                                                setPreviewFile(file);
                                                setPreviewOpen(true);
                                              }}
                                              disabled={isAnyActionExecuting}
                                              className={styles.iconButton}
                                              title="Preview file"
                                            />
                                          }
                                        >
                                          <Eye className={styles.iconSm} />
                                        </PopoverTrigger>
                                        <PopoverContent className={styles.previewPopover}>
                                          <div className="stack space-2">
                                            <div className={styles.previewHeader}>
                                              <div className={cn(styles.previewTitle, 'weight-medium type-sm')}>{file.title}</div>
                                              <Badge
                                                variant="outline"
                                                className={cn(styles.badgeNowrap, 'type-xs')}
                                              >
                                                {file.contentType}
                                              </Badge>
                                            </div>
                                            <FilePreviewContent file={file} />
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled
                                        className={cn(styles.iconButton, styles.iconButtonDisabled)}
                                        title="Preview not available for this file type"
                                      >
                                        <Eye className={styles.iconSm} />
                                      </Button>
                                    )}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleIndividualAction(file.id, file, 'restore')}
                                      disabled={isAnyActionExecuting}
                                      className={styles.iconButton}
                                      title="Restore file"
                                    >
                                      <RotateCcw className={styles.iconSm} />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleIndividualAction(file.id, file, 'delete')}
                                      disabled={isAnyActionExecuting}
                                      className={styles.iconButton}
                                      title="Permanently delete file"
                                    >
                                      <TrashIcon className={styles.iconSm} />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          ) : (
            !isFetchExecuting && (
              <Card>
                <CardContent className={styles.emptyState}>
                  <TrashIcon className={styles.emptyIcon} />
                  <h3 className="type-lg weight-semibold margin-bottom-2">No Deleted Files Found</h3>
                  <p className={styles.muted}>There are currently no soft-deleted files in the system.</p>
                </CardContent>
              </Card>
            )
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.type === 'delete' ? 'Permanently Delete Files' : 'Restore Files'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDialog.type === 'delete' ? (
                <>
                  {`Are you sure you want to permanently delete ${confirmDialog.count} file(s) (${formatSize(confirmDialog.totalSize, TRIMMED_SIZE_OPTIONS)})?`}
                  <br />
                  <strong className={styles.danger}>
                    This action cannot be undone. Files will be removed from both the database and S3 storage permanently.
                  </strong>
                </>
              ) : (
                <>
                  {`Are you sure you want to restore ${confirmDialog.count} file(s) (${formatSize(confirmDialog.totalSize, TRIMMED_SIZE_OPTIONS)})?`}
                  <br />
                  <span className={styles.muted}>Files will be restored to the user's gallery and will be accessible again.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={confirmDialog.type === 'delete' ? styles.destructiveAction : undefined}
            >
              {confirmDialog.type === 'delete' ? 'Permanently Delete' : 'Restore Files'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
