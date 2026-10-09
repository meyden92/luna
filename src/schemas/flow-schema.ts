import { z } from 'zod';

const flowPositionSchema = z.object({ x: z.number(), y: z.number() });

const triggerNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('trigger'),
  position: flowPositionSchema,
  config: z.object({
    triggerType: z.enum(['upload', 'view', 'form-submit', 'schedule', 'manual']),
  }),
});

const tagNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('tag'),
  position: flowPositionSchema,
  config: z.object({ tags: z.array(z.string().min(1)).max(20) }),
});

const privacyNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('privacy'),
  position: flowPositionSchema,
  config: z.object({ private: z.boolean() }),
});

const routeNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('route-folder'),
  position: flowPositionSchema,
  config: z.object({ folderId: z.string().min(1) }),
});

const conditionNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal('condition'),
  position: flowPositionSchema,
  config: z.object({
    field: z.enum(['title', 'contentType', 'tags']),
    contains: z.string().min(1),
  }),
});

export const flowNodeSchema = z.discriminatedUnion('type', [
  triggerNodeSchema,
  tagNodeSchema,
  privacyNodeSchema,
  routeNodeSchema,
  conditionNodeSchema,
]);

// What the automations screen holds while the owner is still typing: the same
// nodes, but a filter text or folder that is still blank is allowed. It is never
// stored; `flowGraphSchema` guards the save.
const conditionDraftNodeSchema = conditionNodeSchema.extend({
  config: conditionNodeSchema.shape.config.extend({ contains: z.string() }),
});
const routeDraftNodeSchema = routeNodeSchema.extend({ config: z.object({ folderId: z.string() }) });

const flowDraftNodeSchema = z.discriminatedUnion('type', [
  triggerNodeSchema,
  tagNodeSchema,
  privacyNodeSchema,
  routeDraftNodeSchema,
  conditionDraftNodeSchema,
]);

export const flowEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  handle: z.string().optional(),
});

export const flowGraphSchema = z
  .object({
    nodes: z.array(flowNodeSchema).min(1).max(50),
    edges: z.array(flowEdgeSchema).max(100),
  })
  .superRefine((graph, ctx) => {
    const ids = new Set(graph.nodes.map((node) => node.id));
    if (!graph.nodes.some((node) => node.type === 'trigger')) {
      ctx.addIssue({ code: 'custom', message: 'A flow requires a trigger node.', path: ['nodes'] });
    }
    for (const edge of graph.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        ctx.addIssue({ code: 'custom', message: 'Edges must connect existing nodes.', path: ['edges'] });
      }
    }
  });

/** `flowGraphSchema` for a graph still being edited: blank filter text and folder choices pass. */
export const flowDraftGraphSchema = z.object({
  nodes: z.array(flowDraftNodeSchema).min(1).max(50),
  edges: z.array(flowEdgeSchema).max(100),
});

export const createFlowSchema = z.object({
  name: z.string().min(1).max(120),
  triggerType: z.enum(['upload', 'view', 'form-submit', 'schedule', 'manual']),
  graph: flowGraphSchema,
  enabled: z.boolean().default(true),
});

export const updateFlowSchema = createFlowSchema.extend({
  id: z.string().min(1),
});

export type FlowGraph = z.infer<typeof flowGraphSchema>;
export type FlowNode = z.infer<typeof flowNodeSchema>;
