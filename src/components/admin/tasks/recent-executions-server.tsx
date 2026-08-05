import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ExecutionRow, { type ExecutionHistoryItem } from './execution-row';

interface RecentExecutionsServerProps {
  executions: ExecutionHistoryItem[];
  hasMore: boolean;
}

export default function RecentExecutionsServer({ executions, hasMore }: RecentExecutionsServerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Executions</CardTitle>
        <p className="text-sm text-muted-foreground">
          Last {executions.length} executions{hasMore ? ' • More available' : ''}
        </p>
      </CardHeader>
      <CardContent>
        {executions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No recent executions found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {executions.map((execution) => (
              <ExecutionRow
                key={execution.id}
                execution={execution}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
