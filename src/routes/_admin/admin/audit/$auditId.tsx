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
import styles from './$auditId.module.css';

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
    <div className={`${styles.root} stack space-6`}>
      <div className={styles.header}>
        <div>
          <Link
            to="/admin/audit"
            className={styles.backLink}
          >
            &larr; Back to Audit Logs
          </Link>
          <h1 className="type-3xl weight-bold">Audit Detail</h1>
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.timeline}>
          <AuditTimeline
            auditLogs={relatedAuditLogs}
            selectedAuditId={selectedAuditLog.id}
            onAuditSelect={setSelectedAuditLog}
          />
        </div>

        <div className={styles.detail}>
          <Card>
            <CardHeader>
              <CardTitle>Audit Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={styles.infoGrid}>
                <dl className={`${styles.fieldList} type-sm`}>
                  <dt className={styles.fieldLabel}>ID:</dt>
                  <dd className={styles.fieldValue}>{selectedAuditLog.id}</dd>

                  <dt className={styles.fieldLabel}>Model:</dt>
                  <dd className={styles.fieldValue}>{selectedAuditLog.model}</dd>

                  <dt className={styles.fieldLabel}>Action:</dt>
                  <dd className={styles.fieldValue}>
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

                  <dt className={styles.fieldLabel}>Record ID:</dt>
                  <dd className={styles.fieldValue}>
                    <Link
                      to="/admin/audit"
                      search={{ model: selectedAuditLog.model, recordId: selectedAuditLog.recordId }}
                      className={styles.recordLink}
                    >
                      {selectedAuditLog.recordId}
                    </Link>
                  </dd>

                  <dt className={styles.fieldLabel}>User:</dt>
                  <dd className={styles.fieldValue}>{selectedAuditLog.user?.name ?? 'System'}</dd>

                  <dt className={styles.fieldLabel}>Timestamp:</dt>
                  <dd className={styles.fieldValue}>{new Date(selectedAuditLog.timestamp).toLocaleString()}</dd>
                </dl>

                {selectedAuditLog.summary && (
                  <dl className={`${styles.fieldList} type-sm`}>
                    <dt className={styles.fieldLabel}>Summary:</dt>
                    <dd className={styles.fieldValue}>{selectedAuditLog.summary}</dd>
                  </dl>
                )}

                {selectedAuditLog.metadata && (
                  <dl className={`${styles.fieldList} type-sm`}>
                    <dt className={styles.fieldLabel}>IP Address:</dt>
                    <dd className={styles.fieldValue}>{selectedAuditLog.metadata.ipAddress || 'N/A'}</dd>

                    <dt className={styles.fieldLabel}>User Agent:</dt>
                    <dd
                      className={`${styles.fieldValueTruncated} type-xs`}
                      title={selectedAuditLog.metadata.userAgent}
                    >
                      {selectedAuditLog.metadata.userAgent || 'N/A'}
                    </dd>
                  </dl>
                )}
              </div>
            </CardContent>
          </Card>

          <div className={styles.changes}>
            <ChangesPanel
              changes={(selectedAuditLog.fieldChanges as FieldChange[]) || []}
              summary={selectedAuditLog.summary || undefined}
              before={selectedAuditLog.before}
              after={selectedAuditLog.after}
              action={selectedAuditLog.action}
              className={styles.changesPanel}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
