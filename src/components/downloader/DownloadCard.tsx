import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { useAppMutation } from '@/hooks/use-app-mutation';
import type { Download, DownloadStatus } from '@/libs/downloads/types';
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

/** One Download: its post, its status, and once ready a preview and Save. */
export function DownloadCard({ download }: { download: Download }) {
  const { mutate: remove, isPending: isRemoving } = useAppMutation(removeDownload, {
    invalidates: [queryKeys.downloads.list],
  });

  const badge = STATUS_BADGE[download.status];
  const video = download.videos[0];
  const error = download.error ?? video?.error;
  const videoUrl = video ? `/api/downloads/${download.id}/${video.index}` : undefined;

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
        {/* Indeterminate until the post is resolved and its video starts downloading. */}
        {download.status === 'preparing' && <Progress value={video ? video.progress : null} />}

        {download.status === 'ready' && video && videoUrl && (
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
          </>
        )}

        {error && <p className={styles.error}>{error.message}</p>}

        <div className={styles.actions}>
          {download.status === 'ready' && videoUrl && (
            <a
              href={videoUrl}
              className={buttonVariants({ size: 'sm' })}
            >
              Save
            </a>
          )}
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
