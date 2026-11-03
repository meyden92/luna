import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { getVersionInfo } from '@/server/fns/admin/version';
import styles from './version-card.module.css';

/** The running LunaShare release next to the latest one on GitHub, for the admin start page. */
export function VersionCard() {
  // Not suspended: the GitHub check may take a few seconds and must not hold up the page.
  const { data } = useQuery({ queryKey: queryKeys.adminVersion.info, queryFn: () => getVersionInfo() });
  const queryClient = useQueryClient();
  const recheck = useMutation({
    mutationFn: () => getVersionInfo({ data: { force: true } }),
    onSuccess: (info) => queryClient.setQueryData(queryKeys.adminVersion.info, info),
  });

  return (
    <Card className={styles.card}>
      <CardHeader>
        <CardTitle>Version</CardTitle>
        <CardDescription>The release this instance runs and the latest one published on GitHub.</CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            disabled={recheck.isPending}
            onClick={() => recheck.mutate()}
          >
            <RefreshCw />
            {recheck.isPending ? 'Checking…' : 'Check now'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className={styles.facts}>
          <dt>Running</dt>
          <dd className="type-mono">{data ? `${data.version ?? 'dev'} (${data.commit.slice(0, 7)})` : '…'}</dd>
          <dt>Latest</dt>
          <dd>{data ? <LatestRelease info={data} /> : '…'}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

function LatestRelease({ info }: { info: Awaited<ReturnType<typeof getVersionInfo>> }) {
  if (!info.latest) return 'Could not check GitHub for releases';
  return (
    <>
      <a
        href={info.latest.url}
        target="_blank"
        rel="noreferrer"
        className="type-mono"
      >
        {info.latest.version}
      </a>
      {info.updateAvailable && <Badge>Update available</Badge>}
      {info.version !== null && !info.updateAvailable && <Badge variant="secondary">Up to date</Badge>}
    </>
  );
}
