import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import prisma from '@/libs/prismadb';
import { createFlowSchema, updateFlowSchema } from '@/schemas/flow-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const flowIdSchema = z.object({ id: z.string().min(1) });

export const listFlows = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    return prisma.flow.findMany({
      where: { ownerId: userIdFromCtx(context), isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
  });

export const createFlow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createFlowSchema)
  .handler(async ({ data, context }) => {
    return prisma.flow.create({
      data: {
        name: data.name,
        ownerId: userIdFromCtx(context),
        enabled: data.enabled,
        triggerType: data.triggerType,
        graph: data.graph,
      },
    });
  });

export const updateFlow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateFlowSchema)
  .handler(async ({ data, context }) => {
    const existing = await prisma.flow.findFirst({ where: { id: data.id, ownerId: userIdFromCtx(context) }, select: { version: true } });
    if (!existing) throw new Error('Flow not found');
    return prisma.flow.update({
      where: { id: data.id },
      data: {
        name: data.name,
        enabled: data.enabled,
        triggerType: data.triggerType,
        graph: data.graph,
        version: existing.version + 1,
      },
    });
  });

export const deleteFlow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(flowIdSchema)
  .handler(async ({ data, context }) => {
    const flow = await prisma.flow.findFirst({ where: { id: data.id, ownerId: userIdFromCtx(context) }, select: { id: true } });
    if (!flow) throw new Error('Flow not found');
    await prisma.$transaction([
      prisma.flow.update({ where: { id: flow.id }, data: { isActive: false, enabled: false } }),
      prisma.token.updateMany({ where: { flowId: flow.id, userId: userIdFromCtx(context) }, data: { flowId: null } }),
    ]);
    return { success: true };
  });

export const listFlowRuns = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(flowIdSchema)
  .handler(async ({ data, context }) => {
    const flow = await prisma.flow.findFirst({ where: { id: data.id, ownerId: userIdFromCtx(context) }, select: { id: true } });
    if (!flow) throw new Error('Flow not found');
    return prisma.flowRun.findMany({
      where: { flowId: flow.id },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
  });
