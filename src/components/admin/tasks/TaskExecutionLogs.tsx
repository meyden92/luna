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

    const colors: Record<string, string> = {
      pending: 'text-yellow-600',
      running: 'text-blue-600',
      success: 'text-green-600',
      failed: 'text-red-600',
      timeout: 'text-orange-600',
    };

    return (
      <Badge
        variant={variants[status] || 'outline'}
        className={colors[status]}
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
        <CardContent className="flex items-center justify-center p-8">
          <RefreshCcwIcon className="h-6 w-6 animate-spin mr-2" />
          Loading execution logs...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="text-center text-red-600">
            <p>Error loading execution logs: {error}</p>
            <Button
              onClick={fetchLogs}
              className="mt-4"
            >
              <RefreshCcwIcon className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Statistics */}
      {logs?.stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{logs.stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Executions</div>
              <div className="text-xs text-muted-foreground">{logs.stats.period}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{logs.stats.successRate}%</div>
              <div className="text-sm text-muted-foreground">Success Rate</div>
              <div className="text-xs text-muted-foreground">{logs.stats.byStatus.success || 0} successful</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-red-600">{logs.stats.byStatus.failed || 0}</div>
              <div className="text-sm text-muted-foreground">Failed</div>
              <div className="text-xs text-muted-foreground">{logs.stats.byStatus.timeout || 0} timeouts</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{logs.stats.averageDuration}ms</div>
              <div className="text-sm text-muted-foreground">Avg Duration</div>
              <div className="text-xs text-muted-foreground">successful tasks</div>
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
          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by task name or error..."
                  value={searchFilter}
                  onChange={(e) => {
                    setSearchFilter(e.target.value);
                    resetPagination();
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-10"
                />
              </div>
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                if (!v) return;
                setStatusFilter(v);
                resetPagination();
              }}
            >
              <SelectTrigger className="w-[180px]">
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
              <SelectTrigger className="w-[120px]">
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
              <SearchIcon className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button
              onClick={fetchLogs}
              variant="outline"
            >
              <RefreshCcwIcon className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Execution logs list */}
          <ScrollArea className="h-[600px]">
            <div className="space-y-4">
              {logs?.executions.map((execution) => (
                <Card
                  key={execution.id}
                  className="relative"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {showTaskColumn && <div className="font-medium">{execution.task.name}</div>}
                          {getStatusBadge(execution.status)}
                          {execution.durationDisplay && <Badge variant="outline">{execution.durationDisplay}</Badge>}
                          <span className="text-sm text-muted-foreground">{formatDate(execution.startedAt)}</span>
                        </div>

                        {execution.resultSummary && (
                          <div className="text-sm mb-2">
                            <strong>Result:</strong> {execution.resultSummary}
                          </div>
                        )}

                        {execution.error && (
                          <div className="text-sm text-red-600 mb-2">
                            <strong>Error:</strong> {execution.error}
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
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
                                  className="mt-2 p-0 h-auto"
                                />
                              }
                            >
                              {expandedLogs.has(execution.id) ? (
                                <ChevronDownIcon className="h-4 w-4 mr-1" />
                              ) : (
                                <ChevronRightIcon className="h-4 w-4 mr-1" />
                              )}
                              View logs ({execution.parsedLogs.length})
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-3 bg-muted/50 rounded-md p-3 max-h-64 overflow-y-auto">
                                {(execution.parsedLogs as unknown as ParsedLog[]).map((log) => (
                                  <div
                                    key={log.timestamp}
                                    className="text-xs font-mono mb-1"
                                  >
                                    <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                    <span
                                      className={`ml-2 font-semibold ${
                                        log.level === 'error'
                                          ? 'text-red-600'
                                          : log.level === 'warn'
                                            ? 'text-yellow-600'
                                            : 'text-foreground'
                                      }`}
                                    >
                                      [{log.level.toUpperCase()}]
                                    </span>
                                    <span className="ml-2">{log.message}</span>
                                    {log.data != null && (
                                      <pre className="mt-1 text-xs text-muted-foreground">{JSON.stringify(log.data, null, 2)}</pre>
                                    )}
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
                                  className="mt-2 p-0 h-auto"
                                />
                              }
                            >
                              <ChevronRightIcon className="h-4 w-4 mr-1" />
                              View result details
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="mt-3 bg-muted/50 rounded-md p-3">
                                <pre className="text-xs overflow-x-auto">{JSON.stringify(execution.resultDetails, null, 2)}</pre>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {logs?.executions.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">No execution logs found for the selected filters.</div>
              )}
            </div>
          </ScrollArea>

          {/* Pagination */}
          {logs && (logs.pagination.hasPrevious || logs.pagination.hasMore) && (
            <div className="flex items-center justify-between mt-6">
              <div className="text-sm text-muted-foreground">
                Showing {logs.executions.length} result{logs.executions.length === 1 ? '' : 's'}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePreviousPage}
                  disabled={!logs.pagination.hasPrevious || !logs.pagination.previousCursor}
                >
                  Previous
                </Button>
                <span className="text-sm">Page {page}</span>
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
