import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import styles from './yt-dlp-card.module.css';

interface YtDlpCardProps {
  version: string | null;
  lastUpdateRun: { startedAt: Date; status: string; summary: string | null } | null;
}

/** The installed yt-dlp and the latest run of the "Update yt-dlp" task, to tell whether a breakage is an old extractor. */
export function YtDlpCard({ version, lastUpdateRun }: YtDlpCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>yt-dlp</CardTitle>
        <CardDescription>Resolves and downloads posts for every Source. It updates itself daily and at boot.</CardDescription>
      </CardHeader>
      <CardContent className={styles.body}>
        <dl className={styles.facts}>
          <dt>Version</dt>
          <dd className="type-mono">{version ?? 'Not installed or not runnable'}</dd>
          <dt>Last update</dt>
          <dd>
            {lastUpdateRun
              ? `${lastUpdateRun.startedAt.toLocaleString()} · ${lastUpdateRun.status}${lastUpdateRun.summary ? ` · ${lastUpdateRun.summary}` : ''}`
              : 'Never run'}
          </dd>
        </dl>
        <Link
          to="/admin/tasks"
          className={styles.link}
        >
          Run the update on the Tasks screen
        </Link>
      </CardContent>
    </Card>
  );
}
