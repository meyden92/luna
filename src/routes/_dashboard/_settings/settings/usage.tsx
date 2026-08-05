import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import StackedBarChart from '@/components/charting/StackedBarChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatSize } from '@/libs/utils';
import { settingsOverviewQuery } from '@/routes/_dashboard/_settings';
import { getMyEgressSummary, getMyViewSummary } from '@/server/fns/analytics';

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
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Usage</h3>
        <p className="text-sm text-muted-foreground">View your usage statistics and limits.</p>
      </div>
      <Separator />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Files</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{settings.filecount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Storage Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatSize(settings.filesize)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivery Egress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatSize(Number(egress?.bytes ?? 0))}</div>
            <p className="text-xs text-muted-foreground">{egress?.requestCount ?? 0} delivery request(s) this month</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Public Views</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{views?.views ?? 0}</div>
            <p className="text-xs text-muted-foreground">{views?.uniques ?? 0} privacy-preserving daily visitor(s)</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>AI Generation</CardTitle>
            <CardDescription>Stats for your template generations.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Generations</span>
                <span className="text-2xl font-bold">{settings.generatorStats.totalGenerations}</span>
              </div>
              <div className="flex justify-between items-center text-green-600">
                <span className="text-sm">Successful</span>
                <span className="font-bold">{settings.generatorStats.successfulGenerations}</span>
              </div>
              <div className="flex justify-between items-center text-red-600">
                <span className="text-sm">Failed</span>
                <span className="font-bold">{settings.generatorStats.failedGenerations}</span>
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
              <div className="flex h-[200px] items-center justify-center text-muted-foreground">No files found</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Activity</CardTitle>
          <CardDescription>Your upload activity over the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px] w-full">
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
          <div className="space-y-2">
            {(egress?.topFiles ?? []).map((row) => (
              <div
                key={`${row.fileId}-${row.rendition}`}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-mono text-xs">{row.fileId}</span>
                <span className="shrink-0 text-muted-foreground">{formatSize(Number(row.bytes))}</span>
              </div>
            ))}
            {egress?.topFiles.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No delivery data yet.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
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
          <div className="space-y-2">
            {(views?.topTargets ?? []).map((target) => (
              <div
                key={`${target.targetKind}-${target.targetId}`}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  {target.targetKind}:{target.targetId}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {target.views} view(s), {target.uniques} unique
                </span>
              </div>
            ))}
            {views?.topTargets.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No view analytics yet.</div>
            ) : null}
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
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">{row.key}</span>
              <span className="shrink-0 text-muted-foreground">{row.count}</span>
            </div>
          ))}
          {rows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">{empty}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
