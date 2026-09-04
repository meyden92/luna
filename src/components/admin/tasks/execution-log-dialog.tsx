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
import styles from './execution-log-dialog.module.css';

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
  const props = { className: styles.statusIcon, 'data-status': status };
  switch (status) {
    case 'success':
      return <CheckCircle {...props} />;
    case 'failed':
      return <XCircle {...props} />;
    case 'timeout':
      return <Timer {...props} />;
    case 'running':
      return <Loader2 {...props} />;
    case 'pending':
      return <Clock {...props} />;
    default:
      return <AlertCircle {...props} />;
  }
};

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
      <DialogContent className={styles.dialog}>
        <DialogHeader>
          <DialogTitle className={styles.title}>
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
          <div className={styles.state}>
            <Loader2
              className={styles.stateIcon}
              data-spin="true"
            />
          </div>
        )}

        {error && (
          <div className={styles.state}>
            <div>
              <AlertCircle className={styles.errorIcon} />
              <p className={styles.errorText}>Failed to load execution details</p>
            </div>
          </div>
        )}

        {execution && (
          <div className={styles.body}>
            {/* Basic Information */}
            <div className={styles.summary}>
              <div className="stack space-2">
                <h4 className={styles.sectionTitle}>Task Information</h4>
                <div className={styles.details}>
                  <p>
                    <strong>Name:</strong> {execution.task.name}
                  </p>
                  <p>
                    <strong>Function:</strong> <code className={styles.code}>{execution.task.taskFunction}</code>
                  </p>
                  <p>
                    <strong>ID:</strong> <code className={styles.code}>{execution.taskId}</code>
                  </p>
                </div>
              </div>

              <div className="stack space-2">
                <h4 className={styles.sectionTitle}>Execution Details</h4>
                <div className={styles.details}>
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
              <div className="stack space-2">
                <div className={styles.sectionHead}>
                  <h4
                    className={styles.sectionTitle}
                    data-tone="error"
                  >
                    Error Details
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(execution.error!)}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <div
                  className={styles.payload}
                  data-tone="error"
                >
                  <pre className={styles.payloadPre}>{execution.error}</pre>
                </div>
              </div>
            )}

            {/* Result */}
            {execution.result && (
              <div className="stack space-2">
                <div className={styles.sectionHead}>
                  <h4
                    className={styles.sectionTitle}
                    data-tone="result"
                  >
                    Result
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(JSON.stringify(execution.result, null, 2))}
                  >
                    <Copy />
                    Copy
                  </Button>
                </div>
                <div
                  className={styles.payload}
                  data-tone="result"
                >
                  <pre className={styles.payloadPre}>{JSON.stringify(execution.result, null, 2)}</pre>
                </div>
              </div>
            )}

            {/* Logs */}
            {(() => {
              const logs: ExecutionLogEntry[] = Array.isArray(execution.logs) ? (execution.logs as unknown as ExecutionLogEntry[]) : [];
              return (
                logs.length > 0 && (
                  <div className={`${styles.logs} stack space-2`}>
                    <h4 className={styles.sectionTitle}>Execution Logs</h4>
                    <ScrollArea className={styles.logScroll}>
                      <div className="stack space-2">
                        {logs.map((log) => (
                          <div
                            key={log.timestamp}
                            className={styles.logLine}
                          >
                            <div className={styles.logHead}>
                              <Badge variant={log.level === 'error' ? 'destructive' : 'outline'}>{log.level}</Badge>
                              <span className={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                              <span className={styles.logMessage}>{log.message}</span>
                            </div>
                            {log.data != null && (
                              <div className={styles.logData}>
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
            <div className={styles.executionId}>
              <strong>Execution ID:</strong> <code>{execution.id}</code>
            </div>
          </div>
        )}

        <div className={styles.footer}>
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
