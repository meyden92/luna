import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAppMutation } from '@/hooks/use-app-mutation';
import type { Download, DownloadStatus, Video, VideoStatus } from '@/libs/downloads/types';
import { queryKeys } from '@/libs/query-keys';
import { formatSize } from '@/libs/utils';
import { removeDownload } from '@/server/fns/downloads';
import styles from './DownloadCard.module.css';

const STATUS_BADGE: Record<DownloadStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  queued: { label: 'Queued', variant: 'outline' },
  preparing: { label: 'Preparing', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
  failed: { label: 'Failed', variant: 'destructive' },
  expired: { label: 'Expired', variant: 'outline' },
};

/** One Download: its post, its status, progress while preparing, and each of its videos. */
export function DownloadCard({ download }: { download: Download }) {
  const { mutate: remove, isPending: isRemoving } = useAppMutation(removeDownload, {
    invalidates: [queryKeys.downloads.list],
  });

  const badge = STATUS_BADGE[download.status];
  const current = download.videos.find((video) => video.index === download.currentIndex);

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <a
            href={download.canonicalUrl}
            target="_blank"
            rel="noreferrer"
            className={styles.postLink}
          >
            {download.account ? `@${download.account}` : download.shortcode}
          </a>
        </CardTitle>
        {download.caption && <CardDescription className={styles.caption}>{download.caption}</CardDescription>}
        <CardAction>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </CardAction>
      </CardHeader>

      <CardContent className={styles.body}>
        {/* Indeterminate until the post is resolved and a video starts downloading. */}
        {download.status === 'preparing' && (
          <div className={styles.progress}>
            <Progress value={current ? current.progress : null} />
            {current && (
              <p className={styles.meta}>
                Video {current.index} of {download.videos.length} · {Math.floor(current.progress)}%
              </p>
            )}
          </div>
        )}

        {download.videos.length > 0 && (
          <ul className={styles.videos}>
            {download.videos.map((video) => (
              <li
                key={video.index}
                className={styles.video}
              >
                <VideoItem
                  downloadId={download.id}
                  video={video}
                  numbered={download.videos.length > 1}
                  saveable={download.status !== 'expired'}
                />
              </li>
            ))}
          </ul>
        )}

        {/* Without videos, the Download's own error is the only explanation. */}
        {download.error && download.videos.length === 0 && <p className={styles.error}>{download.error.message}</p>}

        <div className={styles.actions}>
          <Button
            size="sm"
            variant="outline"
            disabled={isRemoving}
            onClick={() => remove({ id: download.id })}
          >
            Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const VIDEO_STATUS_LABEL: Record<Exclude<VideoStatus, 'ready' | 'failed'>, string> = {
  pending: 'Waiting',
  preparing: 'Preparing…',
};

// One video of a Download: once ready, its preview, resolution, size and Save;
// once failed, its error. Saveable on its own, before the rest of the post is done.
function VideoItem({ downloadId, video, numbered, saveable }: { downloadId: string; video: Video; numbered: boolean; saveable: boolean }) {
  const videoUrl = `/api/downloads/${downloadId}/${video.index}`;

  return (
    <>
      {numbered && <p className={styles.videoTitle}>Video {video.index}</p>}

      {video.status === 'ready' && saveable && (
        <>
          <video
            className={styles.preview}
            src={`${videoUrl}?inline=1`}
            controls
            preload="metadata"
            playsInline
          />
          <p className={styles.meta}>
            {video.width && video.height ? `${video.width}×${video.height} · ` : ''}
            {formatSize(video.sizeBytes, { precision: 1, trim: true })}
          </p>
          <div className={styles.actions}>
            <a
              href={videoUrl}
              className={buttonVariants({ size: 'sm' })}
            >
              Save
            </a>
          </div>
        </>
      )}

      {video.status === 'failed' && video.error && <p className={styles.error}>{video.error.message}</p>}

      {(video.status === 'pending' || video.status === 'preparing') && <p className={styles.meta}>{VIDEO_STATUS_LABEL[video.status]}</p>}
    </>
  );
}
