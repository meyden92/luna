import type { PublicEmbedFile } from '@/libs/oembed';

// Server-only: reaches the database, analytics, and egress. Never import this
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
  const [{ recordViewEvent }, { recordEgress }] = await Promise.all([
    import('@/libs/analytics/view-events'),
    import('@/libs/egress/record'),
  ]);
  void recordViewEvent({ targetKind: 'file', targetId: file.id, ownerId: file.ownerId }).catch(() => undefined);
  void recordEgress({ ownerId: file.ownerId, fileId: file.id, bytes: file.size, rendition: 'embed', wasEstimated: true }).catch(
    () => undefined,
  );
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
