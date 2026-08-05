import type { Prisma } from '@db/client';
import prisma from '@/libs/prismadb';
import { fileS3Key, setObjectPrivacy } from '@/libs/S3Helper';
import { type FlowGraph, type FlowNode, flowGraphSchema } from '@/schemas/flow-schema';

export type FlowItem = {
  fileId?: string;
  title?: string | null;
  contentType?: string | null;
  tags?: string | null;
};

type FlowLog = {
  nodeId: string;
  nodeType: string;
  status: 'success' | 'skipped' | 'failed';
  message: string;
};

export async function dispatchFlowTrigger(triggerType: string, ownerId: string, items: FlowItem[], tokenFlowId?: string | null) {
  const flows = tokenFlowId
    ? await prisma.flow.findMany({ where: { id: tokenFlowId, ownerId, enabled: true, isActive: true } })
    : await prisma.flow.findMany({ where: { ownerId, triggerType, enabled: true, isActive: true } });

  for (const flow of flows) {
    void runFlow(flow.id, items, triggerType).catch(() => undefined);
  }
}

export async function runFlow(flowId: string, items: FlowItem[], triggeredBy = 'manual') {
  const flow = await prisma.flow.findUnique({ where: { id: flowId } });
  if (!flow) throw new Error('Flow not found');

  const graph = flowGraphSchema.parse(flow.graph) as FlowGraph;
  const run = await prisma.flowRun.create({
    data: {
      flowId,
      ownerId: flow.ownerId,
      status: 'running',
      triggeredBy,
      items: items as unknown as Prisma.InputJsonValue,
      logs: [],
    },
  });

  const startedAt = Date.now();
  const logs: FlowLog[] = [];
  try {
    await executeGraph(graph, items, flow.ownerId, logs);

    await prisma.flowRun.update({
      where: { id: run.id },
      data: {
        status: 'success',
        duration: Date.now() - startedAt,
        completedAt: new Date(),
        logs: logs as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    await prisma.flowRun.update({
      where: { id: run.id },
      data: {
        status: 'failed',
        duration: Date.now() - startedAt,
        completedAt: new Date(),
        logs: logs as unknown as Prisma.InputJsonValue,
        error: error instanceof Error ? error.message : 'Flow failed',
      },
    });
  }
}

async function executeGraph(graph: FlowGraph, items: FlowItem[], ownerId: string, logs: FlowLog[]): Promise<void> {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const trigger = graph.nodes.find((node) => node.type === 'trigger') ?? graph.nodes[0];
  if (!trigger) return;

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of graph.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!byId.has(edge.from) || !byId.has(edge.to)) continue;
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  // Only nodes reachable from the trigger participate in the run.
  const reachable = new Set<string>();
  const stack = [trigger.id];
  while (stack.length) {
    const id = stack.pop() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    for (const next of outgoing.get(id) ?? []) stack.push(next);
  }

  // Kahn topological execution: every branch runs, and a fan-in node receives the
  // merged (deduped) output of all its predecessors.
  const indegree = new Map<string, number>();
  for (const id of reachable) {
    indegree.set(id, (incoming.get(id) ?? []).filter((from) => reachable.has(from)).length);
  }
  const outputs = new Map<string, FlowItem[]>();
  const queue = [...reachable].filter((id) => (indegree.get(id) ?? 0) === 0);

  while (queue.length) {
    const id = queue.shift() as string;
    const node = byId.get(id);
    if (!node) continue;

    const preds = (incoming.get(id) ?? []).filter((from) => reachable.has(from));
    const input = preds.length === 0 ? items : dedupeItems(preds.flatMap((from) => outputs.get(from) ?? []));

    if (node.type === 'trigger') {
      outputs.set(id, input);
    } else {
      const result = await executeNode(node, input, ownerId);
      outputs.set(id, result.items);
      logs.push(result.log);
    }

    for (const next of outgoing.get(id) ?? []) {
      if (!reachable.has(next)) continue;
      indegree.set(next, (indegree.get(next) ?? 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }

  // Nodes left unprocessed are stuck in a cycle — surface them instead of dropping silently.
  for (const id of reachable) {
    if (outputs.has(id)) continue;
    const node = byId.get(id);
    if (!node || node.type === 'trigger') continue;
    logs.push({ nodeId: id, nodeType: node.type, status: 'skipped', message: 'Skipped: node is part of a cycle.' });
  }
}

function dedupeItems(items: FlowItem[]): FlowItem[] {
  const seen = new Set<string>();
  const result: FlowItem[] = [];
  for (const item of items) {
    if (item.fileId) {
      if (seen.has(item.fileId)) continue;
      seen.add(item.fileId);
    }
    result.push(item);
  }
  return result;
}

async function executeNode(node: FlowNode, items: FlowItem[], ownerId: string): Promise<{ items: FlowItem[]; log: FlowLog }> {
  if (node.type === 'tag') {
    for (const item of items) {
      if (!item.fileId) continue;
      const merged = mergeTags(item.tags, node.config.tags);
      await prisma.file.updateMany({ where: { id: item.fileId, ownerId }, data: { tags: merged } });
      item.tags = merged;
    }
    return {
      items,
      log: { nodeId: node.id, nodeType: node.type, status: 'success', message: `Applied ${node.config.tags.length} tag(s).` },
    };
  }

  if (node.type === 'privacy') {
    const files = await prisma.file.findMany({
      where: { id: { in: items.map((item) => item.fileId).filter(Boolean) as string[] }, ownerId },
    });
    for (const file of files) {
      await prisma.file.update({ where: { id: file.id }, data: { private: node.config.private } });
      await setObjectPrivacy(fileS3Key(file.ownerId, file.url), node.config.private);
    }
    return {
      items,
      log: { nodeId: node.id, nodeType: node.type, status: 'success', message: `Updated privacy for ${files.length} file(s).` },
    };
  }

  if (node.type === 'route-folder') {
    const folder = await prisma.folder.findFirst({ where: { id: node.config.folderId, ownerId }, select: { id: true } });
    if (!folder) {
      return {
        items,
        log: { nodeId: node.id, nodeType: node.type, status: 'skipped', message: 'Target folder not found for this account.' },
      };
    }
    await prisma.file.updateMany({
      where: { id: { in: items.map((item) => item.fileId).filter(Boolean) as string[] }, ownerId },
      data: { folderId: folder.id },
    });
    return { items, log: { nodeId: node.id, nodeType: node.type, status: 'success', message: 'Moved matching files.' } };
  }

  if (node.type === 'condition') {
    const filtered = items.filter((item) =>
      String(item[node.config.field] ?? '')
        .toLowerCase()
        .includes(node.config.contains.toLowerCase()),
    );
    return {
      items: filtered,
      log: { nodeId: node.id, nodeType: node.type, status: 'success', message: `${filtered.length}/${items.length} item(s) matched.` },
    };
  }

  return { items, log: { nodeId: node.id, nodeType: node.type, status: 'skipped', message: 'No action for node.' } };
}

function mergeTags(existing: string | null | undefined, tags: string[]): string {
  const set = new Set(
    (existing ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
  );
  for (const tag of tags) set.add(tag);
  return Array.from(set).join(',');
}
