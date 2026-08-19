import type { file, fileMetadata } from '@/db/schema/files';

// Inferred from the Drizzle schema rather than Prisma's generated client
// (issue #36). `import type` is erased at compile time, so no Drizzle runtime
// reaches the client bundle.
type File = typeof file.$inferSelect;
type FileMetadata = typeof fileMetadata.$inferSelect;

export type GalleryFile = Omit<File, 'updatedAt' | 'deletedAt' | 'sha256' | 'md5' | 'phash' | 'scrubReport' | 'moderationStatus'> & {
  metadata?: Omit<FileMetadata, 'createdAt' | 'updatedAt' | 'id' | 'fileId'>;
  folder?: {
    id: string;
    name: string;
    color: string | null;
  } | null;
};
