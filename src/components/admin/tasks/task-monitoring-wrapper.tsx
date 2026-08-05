import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { getTaskStats, listExecutions } from '@/server/fns/admin/tasks';
import PeriodSelector from './period-selector';
import RecentExecutionsServer from './recent-executions-server';
import TaskStatsServer from './task-stats-server';

export default function TaskMonitoringWrapper() {
  const [statsPeriod, setStatsPeriod] = useState('30');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.adminTasks.stats(statsPeriod),
    queryFn: () => getTaskStats({ data: { days: Number(statsPeriod) } }),
    refetchInterval: 60000,
  });

  const { data: executionsData, isLoading: executionsLoading } = useQuery({
    queryKey: queryKeys.adminTasks.recentExecutions,
    queryFn: () => listExecutions({ data: { limit: 10 } }),
    refetchInterval: 30000,
  });

  if (statsLoading && executionsLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with period selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Task Monitoring Dashboard</h2>
        <PeriodSelector
          value={statsPeriod}
          onChange={setStatsPeriod}
        />
      </div>

      {/* Stats Section */}
      {stats?.overview && <TaskStatsServer stats={stats} />}

      {/* Recent Executions */}
      {executionsData && (
        <RecentExecutionsServer
          executions={executionsData.executions}
          hasMore={executionsData.pagination.hasMore}
        />
      )}
    </div>
  );
}
