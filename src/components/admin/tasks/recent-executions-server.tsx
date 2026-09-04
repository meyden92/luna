import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ExecutionRow, { type ExecutionHistoryItem } from './execution-row';
import styles from './recent-executions-server.module.css';

interface RecentExecutionsServerProps {
  executions: ExecutionHistoryItem[];
  hasMore: boolean;
}

export default function RecentExecutionsServer({ executions, hasMore }: RecentExecutionsServerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Executions</CardTitle>
        <p className={styles.subtitle}>
          Last {executions.length} executions{hasMore ? ' • More available' : ''}
        </p>
      </CardHeader>
      <CardContent>
        {executions.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyText}>No recent executions found</p>
          </div>
        ) : (
          <div className="stack space-4">
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
