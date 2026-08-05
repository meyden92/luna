import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle, Clock, Copy, Loader2, Timer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { queryKeys } from '@/libs/query-keys';
import { getExecution } from '@/server/fns/admin/tasks';

interface ExecutionLogDialogProps {
  executionId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

type ExecutionDetails = Awaited<ReturnType<typeof getExecution>>;

interface ExecutionLogEntry {
  level: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'timeout':
      return <Timer className="h-4 w-4 text-red-600" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    case 'pending':
      return <Clock className="h-4 w-4 text-yellow-600" />;
    default:
      return <AlertCircle className="h-4 w-4 text-gray-600" />;
  }
};

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

const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text);
  toast.success('Copied to clipboard');
};

export default function ExecutionLogDialog({ executionId, isOpen, onClose }: ExecutionLogDialogProps) {
  const {
    data: execution,
    isLoading,
    error,
  } = useQuery<ExecutionDetails>({
    queryKey: queryKeys.adminTasks.execution(executionId),
    queryFn: async () => {
      if (!executionId) throw new Error('No execution ID provided');

      return getExecution({ data: { id: executionId } });
    },
    enabled: !!executionId && isOpen,
  });

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={onClose}
    >
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Execution Log Details
            {execution && (
              <>
                {getStatusIcon(execution.status)}
                {getStatusBadge(execution.status)}
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Failed to load execution details</p>
            </div>
          </div>
        )}

        {execution && (
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-semibold">Task Information</h4>
                <div className="text-sm">
                  <p>
                    <strong>Name:</strong> {execution.task.name}
                  </p>
                  <p>
                    <strong>Function:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">{execution.task.taskFunction}</code>
                  </p>
                  <p>
                    <strong>ID:</strong> <code className="text-xs bg-muted px-1 py-0.5 rounded">{execution.taskId}</code>
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-semibold">Execution Details</h4>
                <div className="text-sm">
                  <p>
                    <strong>Started:</strong> {new Date(execution.startedAt).toLocaleString()}
                  </p>
                  {execution.completedAt && (
                    <p>
                      <strong>Completed:</strong> {new Date(execution.completedAt).toLocaleString()}
                    </p>
                  )}
                  {execution.duration && (
                    <p>
                      <strong>Duration:</strong> {formatDuration(execution.duration)}
                    </p>
                  )}
                  <p>
                    <strong>Triggered by:</strong> {execution.triggeredBy}
                  </p>
                  {execution.executedByUser && (
                    <p>
                      <strong>Executed by:</strong> {execution.executedByUser.name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <Separator />

            {/* Error Details */}
            {execution.error && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-red-600">Error Details</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(execution.error!)}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                  <pre className="text-xs text-red-800 whitespace-pre-wrap">{execution.error}</pre>
                </div>
              </div>
            )}

            {/* Result */}
            {execution.result && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-green-600">Result</h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(execution.result, null, 2))}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-md p-3">
                  <pre className="text-xs text-green-800 whitespace-pre-wrap">{JSON.stringify(execution.result, null, 2)}</pre>
                </div>
              </div>
            )}

            {/* Logs */}
            {(() => {
              const logs: ExecutionLogEntry[] = Array.isArray(execution.logs) ? (execution.logs as unknown as ExecutionLogEntry[]) : [];
              return (
                logs.length > 0 && (
                  <div className="space-y-2 flex-1 overflow-hidden">
                    <h4 className="font-semibold">Execution Logs</h4>
                    <ScrollArea className="h-64 border rounded-md p-3">
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div
                            key={log.timestamp}
                            className="text-xs"
                          >
                            <div className="flex items-start gap-2">
                              <Badge
                                variant={log.level === 'error' ? 'destructive' : 'outline'}
                                className="text-xs px-1 py-0"
                              >
                                {log.level}
                              </Badge>
                              <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                              <span className="flex-1">{log.message}</span>
                            </div>
                            {log.data != null && (
                              <div className="ml-16 mt-1 text-muted-foreground">
                                <pre>{JSON.stringify(log.data, null, 2)}</pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )
              );
            })()}

            {/* Raw Execution ID for debugging */}
            <div className="text-xs text-muted-foreground">
              <strong>Execution ID:</strong> <code>{execution.id}</code>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
