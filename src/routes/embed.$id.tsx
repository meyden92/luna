import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, notFound } from '@tanstack/react-router';
import AudioContainer from '@/components/file-viewer/AudioContainer';
import ImageContainer from '@/components/file-viewer/ImageView';
import VideoContainer from '@/components/file-viewer/VideoContainer';
import type { PublicEmbedFile } from '@/libs/oembed';
import { queryKeys } from '@/libs/query-keys';
import { getPublicEmbedFile } from '@/server/fns/oembed';
import styles from './embed.module.css';

const publicEmbedFileQueryOptions = (id: string) => ({
  queryKey: [...queryKeys.platform.file(id), 'public-embed'] as const,
  queryFn: () => getPublicEmbedFile({ data: id }),
  staleTime: 5 * 60_000,
  gcTime: 10 * 60_000,
  refetchOnWindowFocus: false,
});

export const Route = createFileRoute('/embed/$id')({
  loader: async ({ context, params }) => {
    const file = await context.queryClient.ensureQueryData(publicEmbedFileQueryOptions(params.id));
    if (!file) throw notFound();
    return { file };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.file.title?.trim() || 'LunaShare embed' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  notFoundComponent: () => <div className={`${styles.unavailable} type-sm`}>This embed is unavailable.</div>,
  component: EmbedPage,
});

function EmbedPage() {
  const { id } = Route.useParams();
  const { data: file } = useSuspenseQuery(publicEmbedFileQueryOptions(id));
  if (!file) throw notFound();

  return (
    <main className={styles.root}>
      <EmbedPreview file={file} />
    </main>
  );
}

function EmbedPreview({ file }: { file: PublicEmbedFile }) {
  if (file.contentType.startsWith('image/')) {
    return (
      <div className={styles.image}>
        <ImageContainer
          src={file.cdnUrl}
          width={file.metadata?.width ?? undefined}
          height={file.metadata?.height ?? undefined}
        />
      </div>
    );
  }

  if (file.contentType.startsWith('video/')) {
    return (
      <div className={styles.video}>
        <VideoContainer
          src={file.cdnUrl}
          title={file.title || 'Untitled Video'}
        />
      </div>
    );
  }

  if (file.contentType.startsWith('audio/')) {
    return (
      <div className={styles.audio}>
        <AudioContainer
          src={file.cdnUrl}
          title={file.title || 'Untitled Audio'}
          data={
            file.metadata
              ? {
                  artist: file.metadata.artist,
                  lyrics: null,
                  duration: file.metadata.duration,
                }
              : null
          }
        />
      </div>
    );
  }

  return <p className={`${styles.fallback} type-sm`}>This file has no in-browser preview.</p>;
}
