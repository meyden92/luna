import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Pause, Play, Plus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AutomationDetail } from '@/components/automations/AutomationDetail';
import { AutomationList, type AutomationListItem } from '@/components/automations/AutomationList';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useFolders } from '@/contexts/FoldersContext';
import type { JsonValue } from '@/db/schema/json';
import { asTriggerType, incompleteReason, type LinearFlow, type TriggerType, toFlowGraph, toLinearFlow } from '@/libs/flows/linear-flow';
import { startViewTransition } from '@/libs/view-transition';
import { type FlowGraph, flowGraphSchema } from '@/schemas/flow-schema';
import { createFlow, deleteFlow, listFlows, updateFlow } from '@/server/fns/flows';
import styles from './automations.module.css';

export const Route = createFileRoute('/_dashboard/automations')({
  head: () => ({ meta: [{ title: 'Automations | LunaShare' }] }),
  component: AutomationsPage,
});

type FlowRow = Awaited<ReturnType<typeof listFlows>>[number];

const FLOWS_KEY = ['flows'] as const;

/** How long after the last keystroke the draft is written back. */
const SAVE_DELAY = 600;

// A validated graph is JSON by construction, but its zod type carries optional
// properties, which `JsonValue` (a jsonb column's type) cannot express. Same cast
// src/server/fns/flows.ts makes, kept to this one place on the client.
const asStoredGraph = (graph: FlowGraph): JsonValue => graph as unknown as JsonValue;

/**
 * Automations: the list of rules on the left, the selected rule's chain on the
 * right.
 *
 * The query cache is the draft. Every edit rewrites the cached row and schedules
 * a debounced save, which means there is no second copy of the flow to keep in
 * step and the list and the detail pane always agree. Nothing invalidates the
 * cache after a save for the same reason — the local row is already the truth.
 */
function AutomationsPage() {
  const queryClient = useQueryClient();
  const { folders } = useFolders();
  const { data: rows = [] } = useQuery({
    queryKey: FLOWS_KEY,
    queryFn: () => listFlows(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const active = rows.find((row) => row.id === activeId) ?? rows[0] ?? null;
  const activeFlow = useMemo(() => (active ? toLinearFlow(active.graph, active.triggerType) : null), [active]);

  const save = useMutation({
    mutationFn: (input: { id: string; name: string; enabled: boolean; triggerType: TriggerType; graph: FlowGraph }) =>
      updateFlow({ data: input }),
    onError: () => toast('Could not save the automation'),
  });

  // One pending row at a time: a later edit replaces the earlier one, and the
  // flush on unmount keeps the last keystroke from being lost on navigation.
  const pending = useRef<FlowRow | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNow = () => {
    const row = pending.current;
    pending.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!row) return;

    const linear = toLinearFlow(row.graph, row.triggerType);
    // An unfinished step cannot be stored; the detail pane says which one.
    if (incompleteReason({ name: row.name, steps: linear.steps })) return;
    const graph = flowGraphSchema.safeParse(toFlowGraph(linear));
    if (!graph.success) return;

    save.mutate({
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      triggerType: asTriggerType(row.triggerType),
      graph: graph.data,
    });
  };

  // The unmount cleanup runs with the first render's closure, so it reaches the
  // latest `saveNow` through a ref rather than saving a stale row.
  const saveNowRef = useRef(saveNow);
  saveNowRef.current = saveNow;
  useEffect(() => () => saveNowRef.current(), []);

  /** Rewrite one cached row and queue it for saving. */
  const writeRow = (id: string, change: (row: FlowRow) => FlowRow) => {
    let next: FlowRow | undefined;
    queryClient.setQueryData<FlowRow[]>(FLOWS_KEY, (current) =>
      current?.map((row) => {
        if (row.id !== id) return row;
        next = change(row);
        return next;
      }),
    );
    if (!next) return;
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, SAVE_DELAY);
  };

  const create = useMutation({
    mutationFn: () =>
      createFlow({
        data: {
          name: 'New automation',
          triggerType: 'upload',
          enabled: false,
          graph: toFlowGraph({ trigger: 'upload', steps: [] }),
        },
      }),
    onSuccess: (row) => {
      queryClient.setQueryData<FlowRow[]>(FLOWS_KEY, (current) => [row, ...(current ?? [])]);
      startViewTransition(() => setActiveId(row.id), 'page');
    },
    onError: () => toast('Could not create the automation'),
  });

  /**
   * Deleting retires the flow (`isActive`), which is what drops it from
   * `listOwnedFlows`. Selection moves to the automation that took its place in
   * the list, or to the one above it when the last row went.
   */
  const remove = useMutation({
    mutationFn: (id: string) => deleteFlow({ data: { id } }),
    onSuccess: (_result, id) => {
      // A queued save for a row that no longer exists would resurrect nothing but noise.
      if (pending.current?.id === id) pending.current = null;

      let next: string | null = null;
      queryClient.setQueryData<FlowRow[]>(FLOWS_KEY, (current = []) => {
        const index = current.findIndex((row) => row.id === id);
        const remaining = current.filter((row) => row.id !== id);
        next = remaining[index]?.id ?? remaining[index - 1]?.id ?? null;
        return remaining;
      });

      startViewTransition(() => setActiveId(next), 'page');
      toast('Automation deleted');
    },
    onError: () => toast('Could not delete the automation'),
  });

  const toggle = (id: string, enabled: boolean) => {
    const row = rows.find((candidate) => candidate.id === id);
    if (!row) return;
    writeRow(id, (current) => ({ ...current, enabled }));
    toast(`${row.name} is ${enabled ? 'on' : 'paused'}`, { icon: enabled ? <Play aria-hidden /> : <Pause aria-hidden /> });
  };

  const items: AutomationListItem[] = useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        trigger: asTriggerType(row.triggerType),
        stepCount: toLinearFlow(row.graph, row.triggerType).steps.length,
      })),
    [rows],
  );

  const applyFlow = (id: string, flow: LinearFlow) =>
    writeRow(id, (current) => ({ ...current, triggerType: flow.trigger, graph: asStoredGraph(toFlowGraph(flow)) }));

  return (
    <div className={styles.split}>
      <AutomationList
        items={items}
        activeId={active?.id ?? null}
        creating={create.isPending}
        onSelect={(id) => startViewTransition(() => setActiveId(id), 'page')}
        onToggle={toggle}
        onCreate={() => create.mutate()}
      />
      {active && activeFlow ? (
        // Keyed on the automation so switching resets the pane's own state — the
        // open delete dialog, and the cards' entry animation.
        <AutomationDetail
          key={active.id}
          name={active.name}
          enabled={active.enabled}
          flow={activeFlow}
          folders={folders}
          deleting={remove.isPending}
          onNameChange={(name) => writeRow(active.id, (current) => ({ ...current, name }))}
          onEnabledChange={(enabled) => writeRow(active.id, (current) => ({ ...current, enabled }))}
          onFlowChange={(flow) => applyFlow(active.id, flow)}
          onDelete={() => remove.mutate(active.id)}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No automations yet</EmptyTitle>
            <EmptyDescription>Create one to sort, tag and protect files the moment they arrive.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              disabled={create.isPending}
              onClick={() => create.mutate()}
            >
              <Plus />
              New automation
            </Button>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
