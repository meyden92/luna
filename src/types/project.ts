import type { File, FileMetadata } from '@db/client';

export type GalleryFile = Omit<File, 'updatedAt' | 'deletedAt' | 'sha256' | 'md5' | 'phash' | 'scrubReport' | 'moderationStatus'> & {
  metadata?: Omit<FileMetadata, 'createdAt' | 'updatedAt' | 'id' | 'fileId'>;
  folder?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
};
