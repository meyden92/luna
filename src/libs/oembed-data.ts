import type { PublicEmbedFile } from '@/libs/oembed';

// Server-only: reaches prismadb, analytics, and egress. Never import this from a
// client route directly — go through getPublicEmbedFile (server fn) instead.
export async function findPublicEmbedFile(id: string): Promise<PublicEmbedFile | null> {
  const [{ default: prisma }, { getCDNImage }, { getPublicOrigin }] = await Promise.all([
    import('@/libs/prismadb'),
    import('@/libs/utils'),
    import('@/libs/request-origin'),
  ]);

  const file = await prisma.file.findFirst({
    where: { id, isDeleted: false, private: false },
    select: {
      id: true,
      title: true,
      url: true,
      ownerId: true,
      contentType: true,
      size: true,
      owner: { select: { name: true } },
      metadata: { select: { artist: true, duration: true, width: true, height: true } },
    },
  });

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
    ownerName: file.owner.name,
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
