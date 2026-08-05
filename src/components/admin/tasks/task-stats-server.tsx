import { Activity, Clock, Loader2, Timer, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import type { getTaskStats } from '@/server/fns/admin/tasks';

// getTaskStats returns a union: per-task stats (when called with taskId) or the
// global dashboard shape — this component renders the global variant.
interface TaskStatsServerProps {
  stats: Extract<Awaited<ReturnType<typeof getTaskStats>>, { overview: unknown }>;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'success':
      return (
        <Badge
          variant="secondary"
          className="text-green-700 bg-green-100"
        >
          Success
        </Badge>
      );
    case 'failed':
      return <Badge variant="destructive">Failed</Badge>;
    case 'timeout':
      return <Badge variant="destructive">Timeout</Badge>;
    case 'running':
      return <Badge variant="default">Running</Badge>;
    case 'pending':
      return <Badge variant="outline">Pending</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const formatDuration = (duration: number) => {
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
};

export default function TaskStatsServer({ stats }: TaskStatsServerProps) {
  return (
    <>
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Tasks"
          value={stats.overview.totalTasks}
          description={`${stats.overview.enabledTasks} enabled, ${stats.overview.disabledTasks} disabled`}
          icon={Activity}
        />

        <StatCard
          title="Running"
          value={stats.overview.runningTasks}
          description="Currently executing"
          icon={Loader2}
          iconClassName="h-4 w-4 text-blue-500"
          valueClassName="text-2xl font-bold text-blue-600"
        />

        <StatCard
          title="Scheduled"
          value={stats.overview.scheduledTasks}
          description="Waiting for next run"
          icon={Clock}
          iconClassName="h-4 w-4 text-green-500"
          valueClassName="text-2xl font-bold text-green-600"
        />

        <StatCard
          title="Success Rate"
          value={`${stats.executions.successRate}%`}
          description={`${stats.executions.successful} / ${stats.executions.total} executions`}
          icon={TrendingUp}
        />

        <StatCard
          title="Avg Duration"
          value={formatDuration(stats.executions.averageDuration)}
          description="Per successful execution"
          icon={Timer}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Execution Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Execution Status Breakdown</CardTitle>
            <p className="text-sm text-muted-foreground">Last {stats.period}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">{getStatusBadge(status)}</div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{count}</span>
                    <span className="text-sm text-muted-foreground">({Math.round((count / stats.executions.total) * 100)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Most Active Tasks */}
        {stats.mostActiveTasks.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Most Active Tasks</CardTitle>
              <p className="text-sm text-muted-foreground">Last {stats.period}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.mostActiveTasks.map((task, index) => (
                  <div
                    key={task.taskId}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className="w-6 h-6 flex items-center justify-center text-xs p-0"
                      >
                        {index + 1}
                      </Badge>
                      <div>
                        <div className="font-medium text-sm">{task.taskName}</div>
                        <div className="text-xs text-muted-foreground">{task.taskId}</div>
                      </div>
                    </div>
                    <Badge variant="secondary">{task.executionCount} runs</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
