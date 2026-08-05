import type { Prisma } from '@db/client';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import prisma from '@/libs/prismadb';
import { appMiddleware } from '@/server/server-fn';

const listAuditLogsSchema = z.object({
  model: z.string().optional(),
  recordId: z.string().optional(),
  search: z.string().optional(),
  action: z.string().optional(),
  cursor: z.string().optional(),
  direction: z.enum(['next', 'previous']).optional(),
  pageSize: z.number().int().min(1).max(200).default(20),
});

const RELATED_AUDIT_LOG_LIMIT = 50;
const AUDIT_CURSOR_SEPARATOR = '|';

type AuditCursor = {
  timestamp: Date;
  id: string;
};

function encodeAuditCursor(log: AuditCursor) {
  return `${log.timestamp.toISOString()}${AUDIT_CURSOR_SEPARATOR}${log.id}`;
}

function parseAuditCursor(cursor?: string): AuditCursor | null {
  if (!cursor) return null;

  const separatorIndex = cursor.indexOf(AUDIT_CURSOR_SEPARATOR);
  if (separatorIndex === -1) throw new Error('Invalid audit cursor');

  const timestamp = new Date(cursor.slice(0, separatorIndex));
  const id = cursor.slice(separatorIndex + 1);
  if (Number.isNaN(timestamp.getTime()) || !id) throw new Error('Invalid audit cursor');

  return { timestamp, id };
}

function getAuditCursorFilter(cursor: AuditCursor, direction: 'next' | 'previous'): Prisma.AuditLogWhereInput {
  if (direction === 'previous') {
    return {
      OR: [{ timestamp: { gt: cursor.timestamp } }, { timestamp: cursor.timestamp, id: { gt: cursor.id } }],
    };
  }

  return {
    OR: [{ timestamp: { lt: cursor.timestamp } }, { timestamp: cursor.timestamp, id: { lt: cursor.id } }],
  };
}

function buildAuditPage<T extends AuditCursor>(rows: T[], pageSize: number, cursor: AuditCursor | null, direction: 'next' | 'previous') {
  const hasExtra = rows.length > pageSize;
  const pageRows = rows.slice(0, pageSize);
  const logs = direction === 'previous' ? pageRows.reverse() : pageRows;
  const firstLog = logs[0];
  const lastLog = logs[logs.length - 1];
  const hasMore = direction === 'previous' ? Boolean(cursor) : hasExtra;
  const hasPrevious = direction === 'previous' ? hasExtra : Boolean(cursor);

  return {
    logs,
    hasMore,
    hasPrevious,
    nextCursor: hasMore && lastLog ? encodeAuditCursor(lastLog) : null,
    previousCursor: hasPrevious && firstLog ? encodeAuditCursor(firstLog) : null,
  };
}

export const listAuditModels = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .handler(async () => {
    const models = await prisma.auditLog.groupBy({ by: ['model'], orderBy: { model: 'asc' } });
    return models.map((m) => m.model);
  });

export const listAuditLogs = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(listAuditLogsSchema)
  .handler(async ({ data }) => {
    const where: Prisma.AuditLogWhereInput = {};
    if (data.model) where.model = data.model;
    if (data.recordId) where.recordId = data.recordId;
    if (data.action) where.action = data.action;

    if (data.search) {
      where.OR = [
        { model: { contains: data.search } },
        { recordId: { contains: data.search } },
        { action: { contains: data.search } },
        { user: { name: { contains: data.search } } },
        { user: { email: { contains: data.search } } },
      ];
    }

    const direction = data.direction ?? 'next';
    const cursor = parseAuditCursor(data.cursor);
    const cursorFilter = cursor ? getAuditCursorFilter(cursor, direction) : undefined;
    const logs = await prisma.auditLog.findMany({
      where: cursorFilter ? { AND: [where, cursorFilter] } : where,
      orderBy: direction === 'previous' ? [{ timestamp: 'asc' }, { id: 'asc' }] : [{ timestamp: 'desc' }, { id: 'desc' }],
      take: data.pageSize + 1,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    const page = buildAuditPage(logs, data.pageSize, cursor, direction);

    return {
      logs: JSON.parse(JSON.stringify(page.logs)),
      hasMore: page.hasMore,
      hasPrevious: page.hasPrevious,
      nextCursor: page.nextCursor,
      previousCursor: page.previousCursor,
    };
  });

export const getAuditLog = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'admin' }))
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auditLog = await prisma.auditLog.findUnique({
      where: { id: data.id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!auditLog) throw new Error('Audit log not found');

    let relatedAuditLogs = await prisma.auditLog.findMany({
      where: { model: auditLog.model, recordId: auditLog.recordId },
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: RELATED_AUDIT_LOG_LIMIT,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!relatedAuditLogs.some((log) => log.id === auditLog.id)) {
      relatedAuditLogs = [...relatedAuditLogs, auditLog].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime() || b.id.localeCompare(a.id),
      );
    }

    return {
      auditLog: JSON.parse(JSON.stringify(auditLog)),
      relatedAuditLogs: JSON.parse(JSON.stringify(relatedAuditLogs)),
    };
  });
