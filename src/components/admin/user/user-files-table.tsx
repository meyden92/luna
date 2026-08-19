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

function getTypeColor(contentType: string): string {
  if (contentType.startsWith('image/')) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';
  }
  if (contentType.startsWith('video/')) {
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
  }
  if (contentType.startsWith('audio/')) {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400';
  }
  if (contentType.includes('pdf')) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
  }
  if (contentType.includes('text') || contentType.includes('json') || contentType.includes('xml')) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400';
  }
  if (contentType.includes('zip') || contentType.includes('archive') || contentType.includes('tar')) {
    return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400';
  }
  // Default for other types
  return 'bg-gray-100 text-gray-700 dark:bg-gray-900/20 dark:text-gray-400';
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
      <div className="flex items-center justify-center p-8 border rounded-lg">
        <p className="text-muted-foreground">No files found for this user.</p>
      </div>
    );
  }

  const startIndex = (currentPage - 1) * 50 + 1;
  const endIndex = Math.min(currentPage * 50, totalFiles);

  return (
    <>
      <div className="space-y-4">
        {/* Filters and Sorting Controls */}
        <div className="flex flex-wrap gap-4 p-4 bg-muted/20 rounded-lg">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          {/* Type Filter */}
          <Select
            value={currentType || 'all'}
            onValueChange={(value) => value && updateSearchParams({ type: value === 'all' ? undefined : value })}
          >
            <SelectTrigger className="w-40">
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
          <div className="flex items-center gap-2">
            <span className="text-sm">From:</span>
            <Input
              type="date"
              value={currentDateFrom || ''}
              onChange={(e) => updateSearchParams({ dateFrom: e.target.value || undefined })}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">To:</span>
            <Input
              type="date"
              value={currentDateTo || ''}
              onChange={(e) => updateSearchParams({ dateTo: e.target.value || undefined })}
              className="w-40"
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

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort('size')}
                  >
                    Size
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort('date')}
                  >
                    Upload Date
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    className="h-auto p-0 font-medium"
                    onClick={() => handleSort('private')}
                  >
                    Private
                    <ArrowUpDown className="ml-1 h-3 w-3" />
                  </Button>
                </TableHead>
                <TableHead className="w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-mono text-xs">{file.id.slice(0, 8)}...</TableCell>
                  <TableCell className="max-w-xs truncate">{file.title}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs ${getTypeColor(file.contentType)}`}>
                      {file.contentType}
                    </span>
                  </TableCell>
                  <TableCell>{formatSize(file.size, ADMIN_FILE_SIZE_OPTIONS)}</TableCell>
                  <TableCell>{format(new Date(file.createdAt), 'MMM dd, yyyy')}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded-md text-xs ${
                        file.private
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                          : 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      }`}
                    >
                      {file.private ? 'Private' : 'Public'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePreview(file)}
                        title="Preview file"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(file.id, file.title)}
                        disabled={isDeletingFile}
                        title="Delete file"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
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
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {startIndex}-{endIndex} of {totalFiles} files
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex items-center gap-1">
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
                    {currentPage > 4 && <span className="text-muted-foreground">...</span>}
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
                    {currentPage < totalPages - 3 && <span className="text-muted-foreground">...</span>}
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
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={previewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
      >
        <DialogContent className="max-w-[90vw] max-h-[90vh] w-[70vw] h-[70vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="p-6 pb-4 flex-shrink-0">
            <DialogTitle className="truncate">{selectedFile?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto p-6 pt-0">{selectedFile && <FilePreview file={selectedFile} />}</div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog />
    </>
  );
}
