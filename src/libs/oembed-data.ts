import type { PublicEmbedFile } from '@/libs/oembed';

// Server-only: reaches the database and egress. Never import this
// from a client route directly — go through getPublicEmbedFile (server fn).
export async function findPublicEmbedFile(id: string): Promise<PublicEmbedFile | null> {
  const [{ getEmbeddableFile }, { getCDNImage }, { getPublicOrigin }] = await Promise.all([
    import('@/db/queries/delivery'),
    import('@/libs/utils'),
    import('@/libs/request-origin'),
  ]);

  const file = await getEmbeddableFile(id);
  if (!file) return null;

  const origin = getPublicOrigin();
  const { recordEgress } = await import('@/libs/egress/record');
  void recordEgress({ ownerId: file.ownerId, bytes: file.size }).catch(() => undefined);
  return {
    id: file.id,
    title: file.title,
    contentType: file.contentType,
    size: file.size ?? null,
    cdnUrl: getCDNImage(`/${file.ownerId}/${file.url}`),
    viewUrl: `${origin}/view/${file.id}`,
    embedUrl: `${origin}/embed/${file.id}`,
    ownerName: file.ownerName,
    metadata: file.metadata
      ? {
          artist: file.metadata.artist,
          duration: file.metadata.duration,
          width: file.metadata.width,
          height: file.metadata.height,
        }
      : null,
  };
}
