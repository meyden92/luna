import { ChevronDownIcon, ChevronRightIcon, RefreshCcwIcon, SearchIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAllTaskLogs } from '@/server/fns/admin/tasks';
import styles from './TaskExecutionLogs.module.css';

type ExecutionLogsResponse = Awaited<ReturnType<typeof getAllTaskLogs>>;

interface ParsedLog {
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  timestamp: string;
  data?: unknown;
}

interface TaskExecutionLogsProps {
  taskId?: string;
  showTaskColumn?: boolean;
}

export default function TaskExecutionLogs({ taskId, showTaskColumn = true }: TaskExecutionLogsProps) {
  const [logs, setLogs] = useState<ExecutionLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [daysFilter, setDaysFilter] = useState('7');
  const [page, setPage] = useState(1);
  const [cursor, setCursor] = useState<string | undefined>();
  const [direction, setDirection] = useState<'next' | 'previous'>('next');

  // Expanded logs state
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const resetPagination = useCallback(() => {
    setPage(1);
    setCursor(undefined);
    setDirection('next');
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const parsedParams: {
        limit: number;
        days: number;
        taskId?: string;
        status?: string;
        search?: string;
        cursor?: string;
        direction?: 'next' | 'previous';
      } = {
        limit: 20,
        days: Number(daysFilter),
        cursor,
        direction,
      };

      if (taskId) {
        parsedParams.taskId = taskId;
      }

      if (statusFilter !== 'all') {
        parsedParams.status = statusFilter;
      }

      if (searchFilter.trim()) {
        parsedParams.search = searchFilter.trim();
      }

      const data = await getAllTaskLogs({ data: parsedParams });
      setLogs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [cursor, daysFilter, direction, taskId, statusFilter, searchFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    resetPagination();
  };

  const handleNextPage = () => {
    if (!logs?.pagination.nextCursor) return;
    setDirection('next');
    setCursor(logs.pagination.nextCursor);
    setPage((currentPage) => currentPage + 1);
  };

  const handlePreviousPage = () => {
    if (!logs?.pagination.previousCursor) return;
    setDirection('previous');
    setCursor(logs.pagination.previousCursor);
    setPage((currentPage) => Math.max(1, currentPage - 1));
  };

  const toggleLogExpansion = (executionId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(executionId)) {
      newExpanded.delete(executionId);
    } else {
      newExpanded.add(executionId);
    }
    setExpandedLogs(newExpanded);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      running: 'secondary',
      success: 'default',
      failed: 'destructive',
      timeout: 'destructive',
    };

    return (
      <Badge
        variant={variants[status] || 'outline'}
        className={styles.statusBadge}
        data-status={status}
      >
        {status.toUpperCase()}
      </Badge>
    );
  };

  const formatDate = (dateString: Date | string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className={styles.loading}>
          <RefreshCcwIcon className={styles.spinner} />
          Loading execution logs...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pad-8">
          <div className={styles.errorState}>
            <p>Error loading execution logs: {error}</p>
            <Button
              onClick={fetchLogs}
              className="margin-top-4"
            >
              <RefreshCcwIcon />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="stack space-6">
      {/* Statistics */}
      {logs?.stats && (
        <div className={styles.stats}>
          <Card>
            <CardContent className="pad-4">
              <div className={styles.statValue}>{logs.stats.total}</div>
              <div className={styles.statLabel}>Total Executions</div>
              <div className={styles.statHint}>{logs.stats.period}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pad-4">
              <div
                className={styles.statValue}
                data-tone="success"
              >
                {logs.stats.successRate}%
              </div>
              <div className={styles.statLabel}>Success Rate</div>
              <div className={styles.statHint}>{logs.stats.byStatus.success || 0} successful</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pad-4">
              <div
                className={styles.statValue}
                data-tone="failed"
              >
                {logs.stats.byStatus.failed || 0}
              </div>
              <div className={styles.statLabel}>Failed</div>
              <div className={styles.statHint}>{logs.stats.byStatus.timeout || 0} timeouts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pad-4">
              <div className={styles.statValue}>{logs.stats.averageDuration}ms</div>
              <div className={styles.statLabel}>Avg Duration</div>
              <div className={styles.statHint}>successful tasks</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.filters}>
            <div className={styles.searchField}>
              <SearchIcon className={styles.searchIcon} />
              <Input
                placeholder="Search by task name or error..."
                value={searchFilter}
                onChange={(e) => {
                  setSearchFilter(e.target.value);
                  resetPagination();
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className={styles.searchInput}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                if (!v) return;
                setStatusFilter(v);
                resetPagination();
              }}
            >
              <SelectTrigger className={styles.statusSelect}>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="timeout">Timeout</SelectItem>
                <SelectItem value="running">Running</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={daysFilter}
              onValueChange={(v) => {
                if (!v) return;
                setDaysFilter(v);
                resetPagination();
              }}
            >
              <SelectTrigger className={styles.daysSelect}>
                <SelectValue placeholder="Days" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 day</SelectItem>
                <SelectItem value="3">3 days</SelectItem>
                <SelectItem value="7">7 days</SelectItem>
                <SelectItem value="30">30 days</SelectItem>
                <SelectItem value="90">90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={handleSearch}
              variant="outline"
            >
              <SearchIcon />
              Search
            </Button>
            <Button
              onClick={fetchLogs}
              variant="outline"
            >
              <RefreshCcwIcon />
              Refresh
            </Button>
          </div>

          {/* Execution logs list */}
          <ScrollArea className={styles.scroll}>
            <div className="stack space-4">
              {logs?.executions.map((execution) => (
                <Card key={execution.id}>
                  <CardContent className="pad-4">
                    <div className={styles.executionHead}>
                      {showTaskColumn && <div className="weight-medium">{execution.task.name}</div>}
                      {getStatusBadge(execution.status)}
                      {execution.durationDisplay && <Badge variant="outline">{execution.durationDisplay}</Badge>}
                      <span className={styles.timestamp}>{formatDate(execution.startedAt)}</span>
                    </div>

                    {execution.resultSummary && (
                      <div className={styles.result}>
                        <strong>Result:</strong> {execution.resultSummary}
                      </div>
                    )}

                    {execution.error && (
                      <div className={styles.error}>
                        <strong>Error:</strong> {execution.error}
                      </div>
                    )}

                    <div className={styles.meta}>
                      Triggered by: {execution.triggeredBy}
                      {execution.executedByUser && <> • Executed by: {execution.executedByUser.name}</>}
                      {execution.task.taskFunction && <> • Function: {execution.task.taskFunction}</>}
                    </div>

                    {/* Detailed logs */}
                    {execution.parsedLogs && execution.parsedLogs.length > 0 && (
                      <Collapsible
                        open={expandedLogs.has(execution.id)}
                        onOpenChange={() => toggleLogExpansion(execution.id)}
                      >
                        <CollapsibleTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className={styles.disclosure}
                            />
                          }
                        >
                          {expandedLogs.has(execution.id) ? <ChevronDownIcon /> : <ChevronRightIcon />}
                          View logs ({execution.parsedLogs.length})
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className={styles.logPanel}>
                            {(execution.parsedLogs as unknown as ParsedLog[]).map((log) => (
                              <div
                                key={log.timestamp}
                                className={styles.logLine}
                              >
                                <span className={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span
                                  className={styles.logLevel}
                                  data-level={log.level}
                                >
                                  [{log.level.toUpperCase()}]
                                </span>
                                <span className={styles.logMessage}>{log.message}</span>
                                {log.data != null && <pre className={styles.logData}>{JSON.stringify(log.data, null, 2)}</pre>}
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {/* Result details */}
                    {execution.resultDetails && (
                      <Collapsible>
                        <CollapsibleTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className={styles.disclosure}
                            />
                          }
                        >
                          <ChevronRightIcon />
                          View result details
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className={styles.detailsPanel}>
                            <pre className={styles.detailsPre}>{JSON.stringify(execution.resultDetails, null, 2)}</pre>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </CardContent>
                </Card>
              ))}

              {logs?.executions.length === 0 && <div className={styles.empty}>No execution logs found for the selected filters.</div>}
            </div>
          </ScrollArea>

          {/* Pagination */}
          {logs && (logs.pagination.hasPrevious || logs.pagination.hasMore) && (
            <div className={styles.pagination}>
              <div className={styles.paginationCount}>
                Showing {logs.executions.length} result{logs.executions.length === 1 ? '' : 's'}
              </div>
              <div className={styles.paginationControls}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!logs.pagination.hasPrevious || !logs.pagination.previousCursor}
                >
                  Previous
                </Button>
                <span className={styles.pageLabel}>Page {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleNextPage}
                  disabled={!logs.pagination.hasMore || !logs.pagination.nextCursor}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
