import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import StackedBarChart from '@/components/charting/StackedBarChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn, formatSize } from '@/libs/utils';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import { getMyEgressSummary, getMyViewSummary } from '@/server/fns/analytics';
import styles from './usage.module.css';

export const Route = createFileRoute('/_dashboard/_settings/settings/usage')({
  head: () => ({ meta: [{ title: 'Usage | LunaShare' }] }),
  component: SettingsUsagePage,
});

function SettingsUsagePage() {
  const { data: settings } = useSuspenseQuery(settingsOverviewQuery);
  const { data: egress } = useQuery({ queryKey: ['egress', 'mine'], queryFn: () => getMyEgressSummary() });
  const { data: views } = useQuery({ queryKey: ['views', 'mine'], queryFn: () => getMyViewSummary() });

  const chartData = settings.stats.map((s) => ({
    category: s.date.split(',')[0],
    uploads: s.count,
  }));

  return (
    <div className="stack space-6">
      <div>
        <h3 className="type-lg weight-medium">Usage</h3>
        <p className={cn('type-sm', styles.muted)}>View your usage statistics and limits.</p>
      </div>
      <Separator />

      <div className={styles.statGrid}>
        <Card>
          <CardHeader className={styles.statHeader}>
            <CardTitle className="type-sm weight-medium">Total Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="type-2xl weight-bold">{settings.filecount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className={styles.statHeader}>
            <CardTitle className="type-sm weight-medium">Total Storage Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="type-2xl weight-bold">{formatSize(settings.filesize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className={styles.statHeader}>
            <CardTitle className="type-sm weight-medium">Delivery Egress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="type-2xl weight-bold">{formatSize(Number(egress?.bytes ?? 0))}</div>
            <p className={cn('type-xs', styles.muted)}>{egress?.requestCount ?? 0} delivery request(s) this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className={styles.statHeader}>
            <CardTitle className="type-sm weight-medium">Public Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="type-2xl weight-bold">{views?.views ?? 0}</div>
            <p className={cn('type-xs', styles.muted)}>{views?.uniques ?? 0} privacy-preserving daily visitor(s)</p>
          </CardContent>
        </Card>
      </div>

      <div className={styles.statGrid}>
        <Card>
          <CardHeader>
            <CardTitle>AI Generation</CardTitle>
            <CardDescription>Stats for your template generations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="stack space-4">
              <div className={styles.between}>
                <span className="type-sm weight-medium">Total Generations</span>
                <span className="type-2xl weight-bold">{settings.generatorStats.totalGenerations}</span>
              </div>
              <div
                className={styles.between}
                data-tone="success"
              >
                <span className="type-sm">Successful</span>
                <span className="weight-bold">{settings.generatorStats.successfulGenerations}</span>
              </div>
              <div
                className={styles.between}
                data-tone="danger"
              >
                <span className="type-sm">Failed</span>
                <span className="weight-bold">{settings.generatorStats.failedGenerations}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>File Types</CardTitle>
            <CardDescription>Distribution of your files by extension.</CardDescription>
          </CardHeader>
          <CardContent>
            {settings.fileExtensions.length > 0 ? (
              <div>Pie Chart coming soon</div>
            ) : (
              <div className={styles.chartEmpty}>No files found</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Activity</CardTitle>
          <CardDescription>Your upload activity over the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent className={styles.chartContent}>
          <div className={styles.chartFrame}>
            <StackedBarChart
              data={chartData}
              stacked={false}
              showLegend={false}
              height={300}
              seriesColors={{ uploads: '#2563eb' }}
              axisLeft={{
                tickSize: 0,
                tickPadding: 10,
                tickRotation: 0,
                legend: 'Uploads',
                legendPosition: 'middle',
                legendOffset: -40,
              }}
              axisBottom={{
                tickSize: 0,
                tickPadding: 10,
                tickRotation: 0,
                format: (v) => `${String(v).slice(0, 3)}..`,
              }}
              summarizeTooltip={false}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Delivered Files</CardTitle>
          <CardDescription>
            Current-month delivery rollups. Direct CDN deliveries are estimated at file size per issued view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack space-2">
            {(egress?.topFiles ?? []).map((row) => (
              <div
                key={`${row.fileId}-${row.rendition}`}
                className={styles.row}
              >
                <span className={cn('type-mono type-xs', styles.rowKey)}>{row.fileId}</span>
                <span className={styles.rowValue}>{formatSize(Number(row.bytes))}</span>
              </div>
            ))}
            {egress?.topFiles.length === 0 ? <div className={styles.empty}>No delivery data yet.</div> : null}
          </div>
        </CardContent>
      </Card>

      <div className={styles.thirdsGrid}>
        <BreakdownCard
          title="Top Referrers"
          empty="No referrer data yet."
          rows={views?.referrers ?? []}
        />
        <BreakdownCard
          title="Devices"
          empty="No device data yet."
          rows={views?.devices ?? []}
        />
        <BreakdownCard
          title="Countries"
          empty="No country data yet."
          rows={views?.countries ?? []}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Viewed Surfaces</CardTitle>
          <CardDescription>Aggregated file and form-share view rollups.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="stack space-2">
            {(views?.topTargets ?? []).map((target) => (
              <div
                key={`${target.targetKind}-${target.targetId}`}
                className={styles.row}
              >
                <span className={cn('type-mono type-xs', styles.rowKey)}>
                  {target.targetKind}:{target.targetId}
                </span>
                <span className={styles.rowValue}>
                  {target.views} view(s), {target.uniques} unique
                </span>
              </div>
            ))}
            {views?.topTargets.length === 0 ? <div className={styles.empty}>No view analytics yet.</div> : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BreakdownCard({ title, rows, empty }: { title: string; rows: Array<{ key: string; count: number }>; empty: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="stack space-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className={styles.row}
            >
              <span className={styles.rowKey}>{row.key}</span>
              <span className={styles.rowValue}>{row.count}</span>
            </div>
          ))}
          {rows.length === 0 ? <div className={styles.empty}>{empty}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
