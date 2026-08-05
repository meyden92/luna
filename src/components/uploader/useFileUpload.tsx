import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { insertGalleryFile } from '@/libs/gallery-cache';
import { queryKeys } from '@/libs/query-keys';
import { formatSize } from '@/libs/utils';
import type { GalleryFile } from '@/types/project';

const MAX_WEB_UPLOAD_BYTES = 200 * 1024 * 1024;

function normalizeUploadContentType(contentType: string | null | undefined): string {
  const normalized = contentType?.trim().toLowerCase();
  return normalized || 'application/octet-stream';
}

function isAllowedUploadContentType(contentType: string): boolean {
  return (
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/') ||
    contentType.startsWith('text/') ||
    contentType.startsWith('application/vnd.') ||
    [
      'application/gzip',
      'application/json',
      'application/octet-stream',
      'application/pdf',
      'application/x-7z-compressed',
      'application/x-rar-compressed',
      'application/x-tar',
      'application/x-zip-compressed',
      'application/xml',
      'application/zip',
    ].includes(contentType)
  );
}

function getUploadValidationError(file: File): string | undefined {
  if (file.size <= 0) {
    return 'File is empty';
  }
  if (file.size > MAX_WEB_UPLOAD_BYTES) {
    return `File is larger than ${formatSize(MAX_WEB_UPLOAD_BYTES)}`;
  }

  const contentType = normalizeUploadContentType(file.type);
  if (!isAllowedUploadContentType(contentType)) {
    return `Unsupported file type: ${contentType}`;
  }

  return undefined;
}

export interface FileStatus {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  url?: string;
  error?: string;
}

export interface FailedUploadFile {
  id: string;
  name: string;
  error?: string;
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number } | undefined> {
  if (!file.type.startsWith('image/')) {
    return undefined;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return undefined;
  }
}

function normalizeUploadedFile(payload: unknown): GalleryFile | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as Partial<GalleryFile> & {
    dbResult?: Partial<GalleryFile>;
    file?: Partial<GalleryFile>;
  };
  const rawFile = candidate.file ?? candidate.dbResult ?? candidate;

  if (!rawFile.id || !rawFile.title || !rawFile.createdAt || !rawFile.ownerId || !rawFile.url || !rawFile.contentType) {
    return undefined;
  }

  return {
    id: rawFile.id,
    title: rawFile.title,
    createdAt: rawFile.createdAt,
    ownerId: rawFile.ownerId,
    folderId: rawFile.folderId ?? null,
    tags: rawFile.tags ?? '',
    url: rawFile.url,
    private: rawFile.private ?? false,
    isDeleted: rawFile.isDeleted ?? false,
    size: rawFile.size ?? 0,
    contentType: rawFile.contentType,
    metadata: rawFile.metadata,
    folder: rawFile.folder ?? null,
  };
}

function getUploadResponseError(status: number, responseText: string): string {
  try {
    const payload = JSON.parse(responseText) as { error?: unknown };
    if (typeof payload.error === 'string') {
      return payload.error;
    }
  } catch {
    if (responseText) return responseText;
  }

  return `Upload failed with status ${status}`;
}

function uploadFormData(formData: FormData, onProgress: (loaded: number, total: number) => void): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload/web');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded, event.total);
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(getUploadResponseError(xhr.status, xhr.responseText)));
        return;
      }

      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Invalid upload response'));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(formData);
  });
}

export const useFileUpload = () => {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedUploadFiles, setFailedUploadFiles] = useState<FailedUploadFile[]>([]);
  const queryClient = useQueryClient();

  const addFiles = useCallback((newFiles: File[]) => {
    const validFiles: File[] = [];
    const rejectedFiles: Array<{ file: File; error: string }> = [];

    for (const file of newFiles) {
      const error = getUploadValidationError(file);
      if (error) {
        rejectedFiles.push({ file, error });
      } else {
        validFiles.push(file);
      }
    }

    if (rejectedFiles.length > 0) {
      const firstRejected = rejectedFiles[0];
      if (!firstRejected) {
        return [];
      }
      toast.error(
        rejectedFiles.length === 1
          ? `${firstRejected.file.name}: ${firstRejected.error}`
          : `${rejectedFiles.length} files were rejected. First error: ${firstRejected.file.name}: ${firstRejected.error}`,
      );
    }

    const fileStatuses = validFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setFiles((prevFiles) => [...prevFiles, ...fileStatuses]);
    return fileStatuses;
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prevFiles) => prevFiles.filter((f) => f.id !== id));
  }, []);

  const resetUploadState = useCallback(() => {
    setIsUploading(false);
    setUploadError(null);
    setFailedUploadFiles([]);
    setUploadProgress(0);
  }, []);

  const clearSuccessfulUploads = useCallback(() => {
    setFiles((prevFiles) => prevFiles.filter((f) => f.status !== 'success'));
  }, []);

  const retryFile = useCallback((id: string) => {
    setFiles((prevFiles) => prevFiles.map((f) => (f.id === id ? { ...f, status: 'pending', error: undefined } : f)));
  }, []);

  const uploadToServer = useCallback(
    async (
      fileStatus: FileStatus,
      onProgress: (loaded: number, total: number) => void,
    ): Promise<{ status: 'success' | 'error'; url?: string; error?: string; fileData?: GalleryFile }> => {
      try {
        const dimensions = await readImageDimensions(fileStatus.file);
        const formData = new FormData();
        formData.append('file', fileStatus.file, fileStatus.file.name);
        formData.append('filename', fileStatus.file.name);
        if (dimensions) {
          formData.append('width', String(dimensions.width));
          formData.append('height', String(dimensions.height));
        }

        const responseData = await uploadFormData(formData, onProgress);
        const fileData = normalizeUploadedFile(responseData);
        if (fileData) {
          insertGalleryFile(queryClient, fileData);
        }

        return { status: 'success', url: fileData?.url, fileData };
      } catch (error) {
        return {
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error during upload',
        };
      }
    },
    [queryClient],
  );

  const handleUpload = useCallback(async () => {
    if (isUploading) return;
    if (files.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setFailedUploadFiles([]);

    try {
      const pendingFiles = files.filter((f) => f.status === 'pending');

      if (pendingFiles.length === 0) {
        toast.error('No pending files to upload');
        return;
      }

      const loadedByFile = new Map<string, number>();
      const totalByFile = new Map(pendingFiles.map((fileStatus) => [fileStatus.id, fileStatus.file.size] as const));
      const updateUploadProgress = (fileStatus: FileStatus, loaded: number, total: number) => {
        const safeTotal = Math.max(total, fileStatus.file.size, 1);
        const safeLoaded = Math.min(Math.max(loaded, 0), safeTotal);
        loadedByFile.set(fileStatus.id, safeLoaded);
        totalByFile.set(fileStatus.id, safeTotal);

        const aggregateTotal = [...totalByFile.values()].reduce((sum, value) => sum + value, 0);
        const aggregateLoaded = [...loadedByFile.values()].reduce((sum, value) => sum + value, 0);
        setUploadProgress(aggregateTotal > 0 ? Math.min(100, (aggregateLoaded / aggregateTotal) * 100) : 0);
        setFiles((prevFiles) =>
          prevFiles.map((f) => (f.id === fileStatus.id ? { ...f, progress: Math.min(100, (safeLoaded / safeTotal) * 100) } : f)),
        );
      };

      const uploadPromises = pendingFiles.map(async (fileStatus) => {
        // Set status to uploading
        setFiles((prevFiles) => prevFiles.map((f) => (f.id === fileStatus.id ? { ...f, status: 'uploading' } : f)));

        try {
          const result = await uploadToServer(fileStatus, (loaded, total) => updateUploadProgress(fileStatus, loaded, total));
          if (result.status === 'success') {
            updateUploadProgress(
              fileStatus,
              totalByFile.get(fileStatus.id) ?? fileStatus.file.size,
              totalByFile.get(fileStatus.id) ?? fileStatus.file.size,
            );
          }

          // Update file status based on result
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.id === fileStatus.id
                ? {
                    ...f,
                    status: result.status,
                    progress: result.status === 'success' ? 100 : f.progress,
                    url: result.url,
                    error: result.error,
                  }
                : f,
            ),
          );

          return result;
        } catch (error) {
          // Update file status to error
          setFiles((prevFiles) =>
            prevFiles.map((f) =>
              f.id === fileStatus.id
                ? {
                    ...f,
                    status: 'error',
                    error: error instanceof Error ? error.message : 'Unknown upload error',
                  }
                : f,
            ),
          );

          return {
            status: 'error' as const,
            error: error instanceof Error ? error.message : 'Unknown upload error',
          };
        }
      });

      // Wait for all uploads to complete
      const results = await Promise.all(uploadPromises);

      // Check for errors
      const errorResults = results.filter((r) => r.status === 'error');
      if (errorResults.length === 0) {
        toast.success(`Successfully uploaded ${results.length} files`);
        // Clear all successfully uploaded files
        setFiles((prevFiles) => prevFiles.filter((f) => f.status !== 'success'));
      } else {
        const firstError = errorResults.find((r) => r.error)?.error;
        const failureMessage = firstError
          ? `Failed to upload ${errorResults.length} of ${results.length} files. ${firstError}`
          : `Failed to upload ${errorResults.length} of ${results.length} files`;
        setFailedUploadFiles(
          results.flatMap((result, index) => {
            if (result.status !== 'error') return [];
            const failedFile = pendingFiles[index];
            if (!failedFile) return [];
            return [
              {
                id: failedFile.id,
                name: failedFile.file.name,
                error: result.error,
              },
            ];
          }),
        );
        setUploadError(failureMessage);
        toast.error(failureMessage);
        // Leave failed files in the list so user can retry
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.gallery.all, refetchType: 'none' });
    } catch (error) {
      setUploadError(`An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  }, [files, isUploading, queryClient, uploadToServer]);

  return {
    files,
    isUploading,
    uploadProgress,
    uploadError,
    failedUploadFiles,
    addFiles,
    removeFile,
    retryFile,
    handleUpload,
    resetUploadState,
    clearSuccessfulUploads,
  };
};
