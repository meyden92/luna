import { Activity, Clock, Loader2, Timer, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import StatCard from '@/components/ui/stat-card';
import type { getTaskStats } from '@/server/fns/admin/tasks';
import styles from './task-stats-server.module.css';

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
          variant="outline"
          className={styles.successBadge}
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
      <div className={styles.overview}>
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
          iconClassName={styles.runningIcon}
          valueClassName={styles.runningValue}
        />

        <StatCard
          title="Scheduled"
          value={stats.overview.scheduledTasks}
          description="Waiting for next run"
          icon={Clock}
          iconClassName={styles.scheduledIcon}
          valueClassName={styles.scheduledValue}
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

      <div className={styles.panels}>
        {/* Execution Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Execution Status Breakdown</CardTitle>
            <p className={styles.period}>Last {stats.period}</p>
          </CardHeader>
          <CardContent>
            <div className="stack space-4">
              {Object.entries(stats.statusBreakdown).map(([status, count]) => (
                <div
                  key={status}
                  className={styles.row}
                >
                  <div className={styles.rowSide}>{getStatusBadge(status)}</div>
                  <div className={styles.rowSide}>
                    <span className={styles.count}>{count}</span>
                    <span className={styles.share}>({Math.round((count / stats.executions.total) * 100)}%)</span>
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
              <p className={styles.period}>Last {stats.period}</p>
            </CardHeader>
            <CardContent>
              <div className="stack space-4">
                {stats.mostActiveTasks.map((task, index) => (
                  <div
                    key={task.taskId}
                    className={styles.row}
                  >
                    <div className={styles.rowSide}>
                      <Badge
                        variant="outline"
                        className={styles.rank}
                      >
                        {index + 1}
                      </Badge>
                      <div>
                        <div className={styles.taskName}>{task.taskName}</div>
                        <div className={styles.taskId}>{task.taskId}</div>
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
