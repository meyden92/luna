import { describe, expect, test } from 'bun:test';
import { createStep, type LinearFlow, orderSteps, summarizeFlow, toFlowGraph, toLinearFlow } from './linear-flow';

/**
 * The automations screen draws a straight chain, but `flow-schema.ts` stores a
 * general graph and `run-flow.ts` executes it topologically. These cover the two
 * places that contract can silently break: the order the chain is stored in, and
 * the sentence the owner reads to check what the chain does.
 */

const flow: LinearFlow = {
  trigger: 'upload',
  steps: [
    { id: 'c1', type: 'condition', position: { x: 0, y: 0 }, config: { field: 'title', contains: 'screenshot' } },
    { id: 'r1', type: 'route-folder', position: { x: 0, y: 0 }, config: { folderId: 'f-work' } },
    { id: 't1', type: 'tag', position: { x: 0, y: 0 }, config: { tags: ['screenshot'] } },
  ],
};

const folderName = (id: string) => (id === 'f-work' ? 'work' : undefined);

describe('chain storage', () => {
  test('stores the chain as positions and a single line of edges', () => {
    const graph = toFlowGraph(flow);

    expect(graph.nodes.map((node) => [node.id, node.position])).toEqual([
      ['trigger', { x: 0, y: 0 }],
      ['c1', { x: 0, y: 1 }],
      ['r1', { x: 0, y: 2 }],
      ['t1', { x: 0, y: 3 }],
    ]);
    expect(graph.edges.map((edge) => [edge.from, edge.to])).toEqual([
      ['trigger', 'c1'],
      ['c1', 'r1'],
      ['r1', 't1'],
    ]);
    // Read back, the steps keep their identity and config; `position` now carries
    // the stored index rather than the placeholder `createStep` hands out.
    const reread = toLinearFlow(graph, 'upload');
    expect(reread.trigger).toBe('upload');
    expect(reread.steps.map((step) => [step.id, step.config])).toEqual(flow.steps.map((step) => [step.id, step.config]));
  });

  test('keeps a condition ahead of the actions already in the chain', () => {
    const actionsOnly: LinearFlow = { trigger: 'upload', steps: flow.steps.slice(1) };
    const added = orderSteps([...actionsOnly.steps, createStep('condition')]);

    expect(added.map((step) => step.type)).toEqual(['condition', 'route-folder', 'tag']);
    // The runner walks the edges, so the filter has to come first there too.
    expect(toFlowGraph({ ...actionsOnly, steps: added }).nodes.map((node) => node.type)).toEqual([
      'trigger',
      'condition',
      'route-folder',
      'tag',
    ]);
  });
});

describe('sentence summary', () => {
  test('reads the chain back as one sentence', () => {
    const { parts, tail } = summarizeFlow(flow, folderName);
    const sentence = parts.map((part) => `${part.lead}**${part.value}**`).join('') + tail;

    expect(sentence).toBe(
      'When **a file is uploaded**, if its file name contains **“screenshot”**, move it to **work**, tag it **screenshot**, done.',
    );
  });

  test('says nothing happens while the chain is only a trigger', () => {
    const { parts, tail } = summarizeFlow({ trigger: 'manual', steps: [] }, folderName);

    expect(parts).toEqual([{ id: 'trigger', lead: 'When ', value: 'I run it manually' }]);
    expect(tail).toBe(', nothing happens yet.');
  });

  test('marks a value the owner has not filled in yet', () => {
    const { parts } = summarizeFlow({ trigger: 'upload', steps: [createStep('route-folder'), createStep('tag')] }, folderName);

    expect(parts.map((part) => part.value)).toEqual(['a file is uploaded', '…', '…']);
  });
});
