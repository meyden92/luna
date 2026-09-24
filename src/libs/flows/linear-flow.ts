import { type FlowGraph, type FlowNode, flowGraphSchema } from '@/schemas/flow-schema';

/**
 * The automations builder's view of a flow: one trigger and an ordered chain of
 * steps. `flow-schema.ts` stores a general graph, but the screen only ever draws
 * a straight line — so the graph is flattened on read and rebuilt as a chain on
 * write, with `position` carrying the order (`{ x: 0, y: index }`).
 *
 * Everything here is pure and framework-free: labels and copy live next to the
 * mapping so the sentence summary and the cards cannot drift apart.
 */

/** Trigger kinds, in the order the "When" select offers them. */
export const TRIGGER_TYPES = ['upload', 'view', 'form-submit', 'schedule', 'manual'] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  upload: 'A file is uploaded',
  view: 'A file is opened',
  'form-submit': 'Someone submits a form share',
  schedule: 'On a schedule',
  manual: 'I run it manually',
};

/**
 * The same triggers as they read mid-sentence in the summary. Lowercasing the
 * labels above would leave "When i run it manually", so the forms are written
 * out and "I" keeps its capital.
 */
const TRIGGER_SUMMARY_LABELS: Record<TriggerType, string> = {
  upload: 'a file is uploaded',
  view: 'a file is opened',
  'form-submit': 'someone submits a form share',
  schedule: 'on a schedule',
  manual: 'I run it manually',
};

/** Every node but the trigger is a step. */
export type StepNode = Exclude<FlowNode, { type: 'trigger' }>;
export type StepType = StepNode['type'];

export const STEP_LABELS: Record<StepType, string> = {
  condition: 'Only if',
  'route-folder': 'Move to folder',
  tag: 'Add tags',
  privacy: 'Set visibility',
};

export const CONDITION_FIELDS = ['title', 'contentType', 'tags'] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_FIELD_LABELS: Record<ConditionField, string> = {
  title: 'File name',
  contentType: 'File type',
  tags: 'Tags',
};

/** `tagNodeSchema` accepts at most 20 tags, so the chip input stops there. */
export const MAX_TAGS_PER_STEP = 20;

export type LinearFlow = { trigger: TriggerType; steps: StepNode[] };

const TRIGGER_NODE_ID = 'trigger';

function isTriggerType(value: string): value is TriggerType {
  return (TRIGGER_TYPES as readonly string[]).includes(value);
}

/** The stored `trigger_type` column is free-form text; fall back to the default. */
export function asTriggerType(value: string): TriggerType {
  return isTriggerType(value) ? value : 'upload';
}

/**
 * Conditions run before actions so a filter can never be applied after the file
 * has already been moved or tagged. Both halves keep their relative order, which
 * is what lets a newly added condition land at the end of the condition block.
 */
export function orderSteps(steps: StepNode[]): StepNode[] {
  return [...steps.filter((step) => step.type === 'condition'), ...steps.filter((step) => step.type !== 'condition')];
}

/**
 * Flatten a stored graph into the chain. A graph that fails validation (an older
 * free-positioned one with an unfinished node, say) yields just its trigger, so
 * the screen still opens and the owner can rebuild it.
 */
export function toLinearFlow(graph: unknown, triggerType: string): LinearFlow {
  const trigger = asTriggerType(triggerType);
  const parsed = flowGraphSchema.safeParse(graph);
  if (!parsed.success) return { trigger, steps: [] };

  const steps = parsed.data.nodes.filter((node): node is StepNode => node.type !== 'trigger');
  // `y` is the chain index this module writes; a graph from the old canvas has
  // arbitrary coordinates, where top-to-bottom is still the best reading order.
  steps.sort((left, right) => left.position.y - right.position.y);
  return { trigger, steps: orderSteps(steps) };
}

/** Rebuild the chain as a graph: the trigger first, then one edge per step. */
export function toFlowGraph({ trigger, steps }: LinearFlow): FlowGraph {
  const nodes: FlowNode[] = [
    { id: TRIGGER_NODE_ID, type: 'trigger', position: { x: 0, y: 0 }, config: { triggerType: trigger } },
    ...orderSteps(steps).map((step, index) => ({ ...step, position: { x: 0, y: index + 1 } })),
  ];

  const edges: FlowGraph['edges'] = [];
  for (let index = 1; index < nodes.length; index += 1) {
    const from = nodes[index - 1];
    const to = nodes[index];
    if (from && to) edges.push({ id: `${from.id}-${to.id}`, from: from.id, to: to.id });
  }

  return { nodes, edges };
}

let stepSequence = 0;

/** A blank step of the requested kind, pre-filled where there is an obvious default. */
export function createStep(type: StepType, defaultFolderId?: string): StepNode {
  stepSequence += 1;
  const id = `${type}-${Date.now().toString(36)}-${stepSequence}`;
  // Rewritten by `toFlowGraph` from the step's place in the chain.
  const position = { x: 0, y: 0 };

  if (type === 'condition') return { id, type, position, config: { field: 'title', contains: '' } };
  if (type === 'route-folder') return { id, type, position, config: { folderId: defaultFolderId ?? '' } };
  if (type === 'tag') return { id, type, position, config: { tags: [] } };
  return { id, type, position, config: { private: true } };
}

/** One clause of the sentence summary: plain text, then the value to embolden. */
export type SummaryPart = { id: string; lead: string; value: string };
export type FlowSummary = { parts: SummaryPart[]; tail: string };

/**
 * The live sentence under the top bar, built from the chain rather than stored:
 * "When **a file is uploaded**, if its file name contains **“screenshot”**, move
 * it to **work**, done." A value the owner has not filled in yet reads as "…".
 */
export function summarizeFlow({ trigger, steps }: LinearFlow, folderName: (folderId: string) => string | undefined): FlowSummary {
  const parts: SummaryPart[] = [{ id: TRIGGER_NODE_ID, lead: 'When ', value: TRIGGER_SUMMARY_LABELS[trigger] }];

  for (const step of orderSteps(steps)) {
    if (step.type === 'condition') {
      parts.push({
        id: step.id,
        lead: `, if its ${CONDITION_FIELD_LABELS[step.config.field].toLowerCase()} contains `,
        value: `“${step.config.contains || '…'}”`,
      });
    }
    if (step.type === 'route-folder') parts.push({ id: step.id, lead: ', move it to ', value: folderName(step.config.folderId) ?? '…' });
    if (step.type === 'tag') parts.push({ id: step.id, lead: ', tag it ', value: step.config.tags.join(', ') || '…' });
    if (step.type === 'privacy') parts.push({ id: step.id, lead: ', make it ', value: step.config.private ? 'private' : 'public' });
  }

  return { parts, tail: steps.length ? ', done.' : ', nothing happens yet.' };
}

/**
 * Why the automation cannot be stored yet, if it cannot. `updateFlowSchema`
 * rejects a blank name, a filter with no text and a folder step with no folder,
 * so the builder keeps those edits local and says which field is still empty
 * rather than dropping them quietly. The route saves only while this is null.
 */
export function incompleteReason({ name, steps }: { name: string; steps: StepNode[] }): string | null {
  if (!name.trim()) return 'Give this automation a name — until then it is not saved.';
  if (steps.some((step) => step.type === 'condition' && !step.config.contains.trim())) {
    return 'Type the text an “Only if” step should look for — until then this automation is not saved.';
  }
  if (steps.some((step) => step.type === 'route-folder' && !step.config.folderId)) {
    return 'Pick a folder for the “Move to folder” step — until then this automation is not saved.';
  }
  return null;
}
