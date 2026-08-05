import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { useState } from 'react';
import { AuditTimeline } from '@/components/admin/audit/AuditTimeline';
import { ChangesPanel } from '@/components/admin/audit/ChangesPanel';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { queryKeys } from '@/libs/query-keys';
import { getAuditLog } from '@/server/fns/admin/audit';
import type { AuditLog, FieldChange } from '@/types/audit';

const auditLogQueryOptions = (id: string) =>
  queryOptions({
    queryKey: queryKeys.adminAudit.log(id),
    queryFn: () => getAuditLog({ data: { id } }),
  });

export const Route = createFileRoute('/_admin/admin/audit/$auditId')({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(auditLogQueryOptions(params.auditId));
    } catch {
      throw notFound();
    }
  },
  head: () => ({ meta: [{ title: 'Audit Details | LunaShare' }] }),
  component: AuditDetailPage,
});

function AuditDetailPage() {
  const { auditId } = Route.useParams();
  const { data } = useSuspenseQuery(auditLogQueryOptions(auditId));
  const { auditLog: initialAuditLog, relatedAuditLogs } = data;

  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog>(initialAuditLog);

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden">
      <div className="flex items-center justify-between">
        <div>
          <Link
            to="/admin/audit"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 mb-2 inline-block"
          >
            &larr; Back to Audit Logs
          </Link>
          <h1 className="text-3xl font-bold">Audit Detail</h1>
        </div>
      </div>

      <div className="space-y-6 flex flex-col overflow-x-hidden max-w-full">
        <div className="flex-shrink-0">
          <AuditTimeline
            auditLogs={relatedAuditLogs}
            selectedAuditId={selectedAuditLog.id}
            onAuditSelect={setSelectedAuditLog}
          />
        </div>

        <div className="flex-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Audit Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                  <dt className="font-medium text-muted-foreground">ID:</dt>
                  <dd className="text-foreground">{selectedAuditLog.id}</dd>

                  <dt className="font-medium text-muted-foreground">Model:</dt>
                  <dd className="text-foreground">{selectedAuditLog.model}</dd>

                  <dt className="font-medium text-muted-foreground">Action:</dt>
                  <dd className="text-foreground">
                    <Badge
                      variant={
                        selectedAuditLog.action === 'create'
                          ? 'secondary'
                          : selectedAuditLog.action === 'update'
                            ? 'default'
                            : selectedAuditLog.action === 'delete'
                              ? 'destructive'
                              : 'outline'
                      }
                    >
                      {selectedAuditLog.action}
                    </Badge>
                  </dd>

                  <dt className="font-medium text-muted-foreground">Record ID:</dt>
                  <dd className="text-foreground">
                    <Link
                      to="/admin/audit"
                      search={{ model: selectedAuditLog.model, recordId: selectedAuditLog.recordId }}
                      className="text-primary hover:text-primary/80"
                    >
                      {selectedAuditLog.recordId}
                    </Link>
                  </dd>

                  <dt className="font-medium text-muted-foreground">User:</dt>
                  <dd className="text-foreground">{selectedAuditLog.user?.name ?? 'System'}</dd>

                  <dt className="font-medium text-muted-foreground">Timestamp:</dt>
                  <dd className="text-foreground">{new Date(selectedAuditLog.timestamp).toLocaleString()}</dd>
                </dl>

                {selectedAuditLog.summary && (
                  <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">Summary:</dt>
                    <dd className="text-foreground">{selectedAuditLog.summary}</dd>
                  </dl>
                )}

                {selectedAuditLog.metadata && (
                  <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
                    <dt className="font-medium text-muted-foreground">IP Address:</dt>
                    <dd className="text-foreground">{selectedAuditLog.metadata.ipAddress || 'N/A'}</dd>

                    <dt className="font-medium text-muted-foreground">User Agent:</dt>
                    <dd
                      className="text-foreground text-xs truncate"
                      title={selectedAuditLog.metadata.userAgent}
                    >
                      {selectedAuditLog.metadata.userAgent || 'N/A'}
                    </dd>
                  </dl>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex-1 min-h-0">
            <ChangesPanel
              changes={(selectedAuditLog.fieldChanges as FieldChange[]) || []}
              summary={selectedAuditLog.summary || undefined}
              before={selectedAuditLog.before}
              after={selectedAuditLog.after}
              action={selectedAuditLog.action}
              className="h-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
