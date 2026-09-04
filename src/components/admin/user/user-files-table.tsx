import { getRouteApi } from '@tanstack/react-router';
import { format } from 'date-fns';
import { ArrowUpDown, ChevronLeft, ChevronRight, Eye, Filter, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { file } from '@/db/schema/files';
import { useAppMutation } from '@/hooks/use-app-mutation';
import { useConfirmation } from '@/hooks/use-confirmation';
import { formatSize } from '@/libs/utils';
import { deleteAdminUserFile } from '@/server/fns/admin/users';
import FilePreview from './file-preview';
import styles from './user-files-table.module.css';

type File = typeof file.$inferSelect;
const routeApi = getRouteApi('/_admin/admin/users/$userid/files');
type UserFilesSearch = ReturnType<typeof routeApi.useSearch>;

interface UserFilesTableProps {
  files: File[];
  userId: string;
  currentPage: number;
  totalPages: number;
  totalFiles: number;
  currentSort?: string;
  currentOrder?: 'asc' | 'desc';
  currentType?: string;
  currentDateFrom?: string;
  currentDateTo?: string;
}

const ADMIN_FILE_SIZE_OPTIONS = { byteUnit: 'Bytes', trim: true } as const;

// Broad family of a content type; the module tints the chip from it.
function getTypeKind(contentType: string): string {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  if (contentType.startsWith('audio/')) return 'audio';
  if (contentType.includes('pdf')) return 'pdf';
  if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) return 'text';
  if (contentType.includes('zip') || contentType.includes('archive') || contentType.includes('tar')) return 'archive';
  return 'other';
}

export default function UserFilesTable({
  files,
  userId,
  currentPage,
  totalPages,
  totalFiles,
  currentSort,
  currentOrder,
  currentType,
  currentDateFrom,
  currentDateTo,
}: UserFilesTableProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const navigate = routeApi.useNavigate();
  const { confirm, ConfirmationDialog } = useConfirmation<{ fileId: string; userId: string }>();

  // Reset to page 1 whenever filters/sorting change.
  const updateSearchParams = (updates: Partial<UserFilesSearch>) => navigate({ search: (prev) => ({ ...prev, ...updates, page: 1 }) });

  const goToPage = (page: number) => navigate({ search: (prev) => ({ ...prev, page }) });

  const handleSort = (field: UserFilesSearch['sort']) => {
    const newOrder = currentSort === field && currentOrder === 'desc' ? 'asc' : 'desc';
    updateSearchParams({ sort: field, order: newOrder });
  };

  const { mutate: deleteFile, isPending: isDeletingFile } = useAppMutation(deleteAdminUserFile, {
    successMessage: 'File deleted successfully',
    errorMessage: 'Failed to delete file',
    onSuccess: () => {
      window.location.reload(); // Simple refresh for now
    },
  });

  const handlePreview = (file: File) => {
    setSelectedFile(file);
    setPreviewDialogOpen(true);
  };

  const handleDelete = (fileId: string, fileName: string) => {
    confirm({
      title: 'Delete File',
      description: `Are you sure you want to delete "${fileName}"? This action cannot be undone.`,
      onConfirm: ({ fileId, userId }) => {
        deleteFile({ fileId, userId });
      },
      data: { fileId, userId },
    });
  };

  if (files.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>No files found for this user.</p>
      </div>
    );
  }

  const startIndex = (currentPage - 1) * 50 + 1;
  const endIndex = Math.min(currentPage * 50, totalFiles);

  return (
    <>
      <div className="stack space-4">
        {/* Filters and Sorting Controls */}
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <Filter className={styles.filterIcon} />
            <span className={styles.filterLabel}>Filters:</span>
          </div>

          {/* Type Filter */}
          <Select
            value={currentType || 'all'}
            onValueChange={(value) => value && updateSearchParams({ type: value === 'all' ? undefined : value })}
          >
            <SelectTrigger className={styles.filterControl}>
              <SelectValue placeholder="File Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="application/pdf">PDFs</SelectItem>
              <SelectItem value="text">Text Files</SelectItem>
              <SelectItem value="application">Applications</SelectItem>
            </SelectContent>
          </Select>

          {/* Date Range Filters */}
          <div className={styles.filterGroup}>
            <span className={styles.filterHint}>From:</span>
            <Input
              type="date"
              value={currentDateFrom || ''}
              onChange={(e) => updateSearchParams({ dateFrom: e.target.value || undefined })}
              className={styles.filterControl}
            />
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterHint}>To:</span>
            <Input
              type="date"
              value={currentDateTo || ''}
              onChange={(e) => updateSearchParams({ dateTo: e.target.value || undefined })}
              className={styles.filterControl}
            />
          </div>

          {/* Clear Filters */}
          {(currentType || currentDateFrom || currentDateTo || currentSort) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateSearchParams({ type: undefined, dateFrom: undefined, dateTo: undefined, sort: undefined, order: undefined })
              }
            >
              Clear Filters
            </Button>
          )}
        </div>

        <div className={styles.tableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className={styles.sortButton}
                    onClick={() => handleSort('size')}
                  >
                    Size
                    <ArrowUpDown />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className={styles.sortButton}
                    onClick={() => handleSort('date')}
                  >
                    Upload Date
                    <ArrowUpDown />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className={styles.sortButton}
                    onClick={() => handleSort('private')}
                  >
                    Private
                    <ArrowUpDown />
                  </Button>
                </TableHead>
                <TableHead className={styles.actionsColumn}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className={styles.idCell}>{file.id.slice(0, 8)}...</TableCell>
                  <TableCell className={styles.titleCell}>{file.title}</TableCell>
                  <TableCell>
                    <span
                      className={styles.chip}
                      data-kind={getTypeKind(file.contentType)}
                    >
                      {file.contentType}
                    </span>
                  </TableCell>
                  <TableCell>{formatSize(file.size, ADMIN_FILE_SIZE_OPTIONS)}</TableCell>
                  <TableCell>{format(new Date(file.createdAt), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>
                    <span
                      className={styles.chip}
                      data-kind={file.private ? 'private' : 'public'}
                    >
                      {file.private ? 'Private' : 'Public'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className={styles.rowActions}>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePreview(file)}
                        title="Preview file"
                      >
                        <Eye />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.id, file.title)}
                        disabled={isDeletingFile}
                        title="Delete file"
                        className={styles.deleteButton}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className={styles.pagination}>
            <div className={styles.paginationCount}>
              Showing {startIndex}-{endIndex} of {totalFiles} files
            </div>
            <div className={styles.paginationControls}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft />
                Previous
              </Button>

              <div className={styles.pageButtons}>
                {/* Show first page */}
                {currentPage > 3 && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(1)}
                    >
                      1
                    </Button>
                    {currentPage > 4 && <span className={styles.ellipsis}>...</span>}
                  </>
                )}

                {/* Show pages around current page */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const page = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                  if (page > totalPages) return null;

                  return (
                    <Button
                      key={page}
                      variant={page === currentPage ? 'default' : 'outline'}
                      size="sm"
                      disabled={page === currentPage}
                      onClick={() => {
                        if (page !== currentPage) goToPage(page);
                      }}
                    >
                      {page}
                    </Button>
                  );
                })}

                {/* Show last page */}
                {currentPage < totalPages - 2 && (
                  <>
                    {currentPage < totalPages - 3 && <span className={styles.ellipsis}>...</span>}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => goToPage(totalPages)}
                    >
                      {totalPages}
                    </Button>
                  </>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
              >
                Next
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
      >
        <DialogContent className={styles.previewDialog}>
          <DialogHeader className={styles.previewHeader}>
            <DialogTitle className="type-truncate">{selectedFile?.title}</DialogTitle>
          </DialogHeader>
          <div className={styles.previewBody}>{selectedFile && <FilePreview file={selectedFile} />}</div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog />
    </>
  );
}
