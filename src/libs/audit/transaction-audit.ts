import type { Prisma } from '@db/client';
import { DiffEngine } from '@/libs/audit/diff-engine';
import { MetadataCollector } from '@/libs/audit/metadata-collector';
import { Summarizer } from '@/libs/audit/summarizer';

type AuditTransaction = {
  auditLog: {
    createMany: (args: { data: Prisma.AuditLogCreateManyInput | Prisma.AuditLogCreateManyInput[] }) => Promise<unknown>;
  };
};

type AuditRecord = { id: string } & Record<string, unknown>;

function auditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function auditMetadata(metadata: unknown): Prisma.InputJsonValue | undefined {
  return metadata ? auditJson(metadata) : undefined;
}

export async function writeCreateAuditLog(
  tx: AuditTransaction,
  {
    model,
    record,
    userId,
  }: {
    model: string;
    record: AuditRecord;
    userId: string | null;
  },
): Promise<void> {
  const metadata = auditMetadata(await MetadataCollector.collectFromRequest());
  const changeSet = MetadataCollector.generateChangeSetId();
  const diffResult = DiffEngine.generateDiffResult(null, record);

  const data: Prisma.AuditLogCreateManyInput = {
    model,
    action: 'create',
    recordId: record.id,
    userId,
    after: auditJson(record),
    metadata,
    changeSet,
    summary: Summarizer.generateActionSummary(model, 'create', diffResult.changes, record.id),
    fieldChanges: diffResult.hasChanges ? auditJson(diffResult.changes) : undefined,
  };

  await tx.auditLog.createMany({ data });
}
