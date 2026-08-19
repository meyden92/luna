import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  createOwnedFlow,
  deactivateOwnedFlow,
  getOwnedFlow,
  listFlowRuns as listFlowRunsQuery,
  listOwnedFlows,
  updateOwnedFlow,
} from '@/db/queries/flows';
import type { JsonValue } from '@/db/schema/json';
import { createFlowSchema, type FlowGraph, updateFlowSchema } from '@/schemas/flow-schema';
import { userIdFromCtx } from '@/server/middleware/context-helpers';
import { appMiddleware } from '@/server/server-fn';

const flowIdSchema = z.object({ id: z.string().min(1) });

// The validated graph is JSON by construction, but its zod type carries optional
// properties, which `JsonValue` (a jsonb column's type) cannot express. Same cast
// the Prisma version made to `Prisma.InputJsonValue`, kept to this one place.
const asJson = (graph: FlowGraph): JsonValue => graph as unknown as JsonValue;

export const listFlows = createServerFn({ method: 'GET' })
  .middleware(appMiddleware({ auth: 'user' }))
  .handler(async ({ context }) => {
    return listOwnedFlows(userIdFromCtx(context));
  });

export const createFlow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(createFlowSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    return createOwnedFlow(
      { name: data.name, ownerId: userId, enabled: data.enabled, triggerType: data.triggerType, graph: asJson(data.graph) },
      userId,
    );
  });

export const updateFlow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(updateFlowSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const updated = await updateOwnedFlow(
      {
        id: data.id,
        ownerId: userId,
        name: data.name,
        enabled: data.enabled,
        triggerType: data.triggerType,
        graph: asJson(data.graph),
      },
      userId,
    );
    if (!updated) throw new Error('Flow not found');
    return updated;
  });

export const deleteFlow = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(flowIdSchema)
  .handler(async ({ data, context }) => {
    const userId = userIdFromCtx(context);
    const retired = await deactivateOwnedFlow({ id: data.id, ownerId: userId }, userId);
    if (!retired) throw new Error('Flow not found');
    return { success: true };
  });

export const listFlowRuns = createServerFn({ method: 'POST' })
  .middleware(appMiddleware({ auth: 'user' }))
  .validator(flowIdSchema)
  .handler(async ({ data, context }) => {
    const flow = await getOwnedFlow(data.id, userIdFromCtx(context));
    if (!flow) throw new Error('Flow not found');
    return listFlowRunsQuery(flow.id);
  });
