import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  type Connection,
  Controls,
  type Edge,
  type EdgeChange,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { GitBranch, Pause, Play, Plus, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/libs/utils';
import { type FlowGraph, type FlowNode, flowGraphSchema } from '@/schemas/flow-schema';
import { createFlow, deleteFlow, listFlowRuns, listFlows, updateFlow } from '@/server/fns/flows';
import styles from './automations.module.css';

export const Route = createFileRoute('/_dashboard/automations')({
  head: () => ({ meta: [{ title: 'Automations | LunaShare' }] }),
  component: AutomationsPage,
});

const triggerTypes = ['upload', 'view', 'form-submit', 'schedule', 'manual'] as const;
const actionTypes = ['tag', 'privacy', 'route-folder', 'condition'] as const;
const conditionFields = ['title', 'contentType', 'tags'] as const;

type TriggerType = (typeof triggerTypes)[number];
type ActionType = (typeof actionTypes)[number];
type CanvasNodeData = {
  label: string;
  nodeType: FlowNode['type'];
  summary: string;
};

function AutomationsPage() {
  const queryClient = useQueryClient();
  const { data: flows = [] } = useQuery({ queryKey: ['flows'], queryFn: () => listFlows() });
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState('New automation');
  const [enabled, setEnabled] = useState(true);
  const [triggerType, setTriggerType] = useState<TriggerType>('upload');
  const [nodes, setNodes] = useState<Node<CanvasNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const selectedFlow = flows.find((flow) => flow.id === selectedFlowId) ?? flows[0] ?? null;
  const selectedFlowGraph = useMemo(() => parseStoredGraph(selectedFlow?.graph), [selectedFlow?.graph]);
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);
  const { data: runs = [] } = useQuery({
    queryKey: ['flows', selectedFlow?.id, 'runs'],
    queryFn: () => (selectedFlow ? listFlowRuns({ data: { id: selectedFlow.id } }) : Promise.resolve([])),
    enabled: Boolean(selectedFlow),
  });

  useEffect(() => {
    if (!selectedFlow) {
      const graph = starterGraph('upload');
      setName('Tag incoming uploads');
      setEnabled(true);
      setTriggerType('upload');
      setNodes(toCanvasNodes(graph));
      setEdges(toCanvasEdges(graph));
      setSelectedNodeId('trigger');
      return;
    }

    const graph = selectedFlowGraph ?? starterGraph(selectedFlow.triggerType as TriggerType);
    setSelectedFlowId(selectedFlow.id);
    setName(selectedFlow.name);
    setEnabled(selectedFlow.enabled);
    setTriggerType(selectedFlow.triggerType as TriggerType);
    setNodes(toCanvasNodes(graph));
    setEdges(toCanvasEdges(graph));
    setSelectedNodeId(graph.nodes[0]?.id ?? null);
  }, [selectedFlow, selectedFlowGraph]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const graph = toFlowGraph(nodes, edges, triggerType);
      return createFlow({ data: { name, triggerType, enabled, graph } });
    },
    onSuccess: async (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      setSelectedFlowId(flow.id);
      toast.success('Flow created');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create flow');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFlow) throw new Error('Select a flow first');
      const graph = toFlowGraph(nodes, edges, triggerType);
      return updateFlow({ data: { id: selectedFlow.id, name, triggerType, enabled, graph } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Flow saved');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to save flow');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFlow) throw new Error('Select a flow first');
      return deleteFlow({ data: { id: selectedFlow.id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      setSelectedFlowId(null);
      toast.success('Flow paused and archived');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete flow');
    },
  });

  const onNodesChange = (changes: NodeChange<Node<CanvasNodeData>>[]) => setNodes((current) => applyNodeChanges(changes, current));
  const onEdgesChange = (changes: EdgeChange<Edge>[]) => setEdges((current) => applyEdgeChanges(changes, current));
  const onConnect = (connection: Connection) => {
    setEdges((current) =>
      addEdge(
        {
          ...connection,
          id: `${connection.source}-${connection.target}-${Date.now()}`,
          animated: true,
          type: 'smoothstep',
        },
        current,
      ),
    );
  };

  const resetDraft = () => {
    const graph = starterGraph('upload');
    setSelectedFlowId(null);
    setSelectedNodeId('trigger');
    setName('Tag incoming uploads');
    setEnabled(true);
    setTriggerType('upload');
    setNodes(toCanvasNodes(graph));
    setEdges(toCanvasEdges(graph));
  };

  const updateTriggerType = (next: TriggerType) => {
    setTriggerType(next);
    setNodes((current) =>
      current.map((node) =>
        node.id === 'trigger'
          ? toCanvasNode({ id: node.id, type: 'trigger', position: node.position, config: { triggerType: next } })
          : node,
      ),
    );
  };

  const addActionNode = (type: ActionType) => {
    const id = `${type}-${Date.now()}`;
    const node = defaultFlowNode(type, id, { x: 260 + nodes.length * 36, y: 80 + nodes.length * 28 });
    setNodes((current) => [...current, toCanvasNode(node)]);
    setSelectedNodeId(id);
  };

  const updateSelectedNode = (node: FlowNode) => {
    setNodes((current) => current.map((candidate) => (candidate.id === node.id ? toCanvasNode(node) : candidate)));
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <h1 className={cn('type-2xl weight-bold', styles.title)}>
            <GitBranch className={styles.titleIcon} />
            Automations
          </h1>
          <p className={cn('type-sm', styles.subtitle)}>Build typed workflows with drag-and-wire nodes, then inspect every run.</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            onClick={resetDraft}
          >
            <Plus className={styles.icon} />
            New draft
          </Button>
          <Button
            variant="outline"
            disabled={!selectedFlow || deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            <Trash2 className={styles.icon} />
            Archive
          </Button>
          <Button
            onClick={() => (selectedFlow ? updateMutation.mutate() : createMutation.mutate())}
            disabled={createMutation.isPending || updateMutation.isPending}
          >
            <Save className={styles.icon} />
            {selectedFlow ? 'Save flow' : 'Create flow'}
          </Button>
        </div>
      </div>

      <div className={styles.layout}>
        <Card className={styles.rowSpan2}>
          <CardHeader>
            <CardTitle>Flows</CardTitle>
            <CardDescription>Enabled flows can run globally or from a token binding.</CardDescription>
          </CardHeader>
          <CardContent className={styles.flowList}>
            {flows.map((flow) => (
              <button
                key={flow.id}
                type="button"
                onClick={() => setSelectedFlowId(flow.id)}
                className={styles.flowItem}
                data-active={selectedFlow?.id === flow.id}
              >
                <span className={styles.flowItemHead}>
                  <span className={styles.flowItemName}>{flow.name}</span>
                  {flow.enabled ? (
                    <Play className={cn(styles.icon, styles.flowStateIcon)} />
                  ) : (
                    <Pause
                      className={cn(styles.icon, styles.flowStateIcon)}
                      data-tone="muted"
                    />
                  )}
                </span>
                <span className={styles.flowItemMeta}>
                  {flow.triggerType} · v{flow.version}
                </span>
              </button>
            ))}
            {flows.length === 0 ? <div className={styles.empty}>Create a flow from the canvas draft.</div> : null}
          </CardContent>
        </Card>

        <Card className={styles.canvasCard}>
          <CardHeader>
            <div className={styles.canvasHeader}>
              <div>
                <CardTitle>Flow Canvas</CardTitle>
                <CardDescription>Drag nodes, connect actions, and save the validated graph.</CardDescription>
              </div>
              <div className={styles.canvasActions}>
                {actionTypes.map((type) => (
                  <Button
                    key={type}
                    size="sm"
                    variant="outline"
                    onClick={() => addActionNode(type)}
                  >
                    <Plus className={styles.icon} />
                    {nodeTitle(type)}
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className={styles.canvasFrame}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap
                  pannable
                  zoomable
                />
              </ReactFlow>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.rowSpan2}>
          <CardHeader>
            <CardTitle>Inspector</CardTitle>
            <CardDescription>{selectedNode ? selectedNode.data.label : 'Select a node to edit its config.'}</CardDescription>
          </CardHeader>
          <CardContent className={styles.inspectorBody}>
            <div className={styles.field}>
              <Label htmlFor="flow-name">Name</Label>
              <Input
                id="flow-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <Label>Trigger</Label>
              <Select
                value={triggerType}
                onValueChange={(value) => updateTriggerType(value as TriggerType)}
              >
                <SelectTrigger className={styles.selectFull}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {triggerTypes.map((type) => (
                    <SelectItem
                      key={type}
                      value={type}
                    >
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className={styles.toggleRow}>
              <span>{enabled ? 'Enabled' : 'Paused'}</span>
              <Switch
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </label>

            <NodeInspector
              node={selectedNode ? canvasNodeToFlowNode(selectedNode, triggerType) : null}
              onChange={updateSelectedNode}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Runs</CardTitle>
            <CardDescription>{selectedFlow ? selectedFlow.name : 'Create or select a saved flow'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Started</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="weight-medium">{run.status}</TableCell>
                    <TableCell>{run.triggeredBy}</TableCell>
                    <TableCell>{run.duration ? `${run.duration} ms` : '-'}</TableCell>
                    <TableCell>{new Date(run.startedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {runs.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className={styles.runsErrorCell}
                    >
                      No runs recorded.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
            {runs.map((run) => (
              <p
                key={`${run.id}-error`}
                className={styles.runError}
              >
                {run.error}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function NodeInspector({ node, onChange }: { node: FlowNode | null; onChange: (node: FlowNode) => void }) {
  if (!node) return <div className={styles.inspectorEmpty}>No node selected.</div>;

  if (node.type === 'trigger') {
    return <div className={styles.inspectorNote}>The trigger node follows the flow trigger above.</div>;
  }

  if (node.type === 'tag') {
    return (
      <div className={styles.field}>
        <Label htmlFor="node-tags">Tags</Label>
        <Input
          id="node-tags"
          value={node.config.tags.join(', ')}
          onChange={(event) =>
            onChange({
              ...node,
              config: {
                tags: event.target.value
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              },
            })
          }
        />
      </div>
    );
  }

  if (node.type === 'privacy') {
    return (
      <label className={styles.toggleRow}>
        <span>{node.config.private ? 'Make private' : 'Make public'}</span>
        <Switch
          checked={node.config.private}
          onCheckedChange={(checked) => onChange({ ...node, config: { private: checked } })}
        />
      </label>
    );
  }

  if (node.type === 'route-folder') {
    return (
      <div className={styles.field}>
        <Label htmlFor="node-folder">Folder ID</Label>
        <Input
          id="node-folder"
          value={node.config.folderId}
          onChange={(event) => onChange({ ...node, config: { folderId: event.target.value } })}
        />
      </div>
    );
  }

  return (
    <div className={styles.fieldStack}>
      <div className={styles.field}>
        <Label>Field</Label>
        <Select
          value={node.config.field}
          onValueChange={(value) => onChange({ ...node, config: { ...node.config, field: value as (typeof conditionFields)[number] } })}
        >
          <SelectTrigger className={styles.selectFull}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {conditionFields.map((field) => (
              <SelectItem
                key={field}
                value={field}
              >
                {field}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={styles.field}>
        <Label htmlFor="node-contains">Contains</Label>
        <Input
          id="node-contains"
          value={node.config.contains}
          onChange={(event) => onChange({ ...node, config: { ...node.config, contains: event.target.value } })}
        />
      </div>
    </div>
  );
}

function parseStoredGraph(graph: unknown): FlowGraph | null {
  const parsed = flowGraphSchema.safeParse(graph);
  return parsed.success ? parsed.data : null;
}

function starterGraph(triggerType: TriggerType): FlowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'trigger', position: { x: 0, y: 120 }, config: { triggerType } },
      { id: 'tag', type: 'tag', position: { x: 300, y: 120 }, config: { tags: ['automated'] } },
    ],
    edges: [{ id: 'trigger-tag', from: 'trigger', to: 'tag' }],
  };
}

function toCanvasNodes(graph: FlowGraph): Node<CanvasNodeData>[] {
  return graph.nodes.map(toCanvasNode);
}

function toCanvasNode(node: FlowNode): Node<CanvasNodeData> {
  return {
    id: node.id,
    type: 'default',
    position: node.position,
    data: {
      label: nodeTitle(node.type),
      nodeType: node.type,
      summary: nodeSummary(node),
    },
    className: node.type === 'trigger' ? styles.flowNodeTrigger : styles.flowNodeDefault,
  };
}

function toCanvasEdges(graph: FlowGraph): Edge[] {
  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.from,
    target: edge.to,
    animated: true,
    type: 'smoothstep',
  }));
}

function toFlowGraph(nodes: Node<CanvasNodeData>[], edges: Edge[], triggerType: TriggerType): FlowGraph {
  const graph = {
    nodes: nodes.map((node) => canvasNodeToFlowNode(node, triggerType)),
    edges: edges.flatMap((edge) => (edge.source && edge.target ? [{ id: edge.id, from: edge.source, to: edge.target }] : [])),
  };
  return flowGraphSchema.parse(graph);
}

function canvasNodeToFlowNode(node: Node<CanvasNodeData>, triggerType: TriggerType): FlowNode {
  const base = { id: node.id, position: node.position };
  if (node.data.nodeType === 'trigger') return { ...base, type: 'trigger', config: { triggerType } };
  if (node.data.nodeType === 'privacy') return { ...base, type: 'privacy', config: parsePrivacy(node.data.summary) };
  if (node.data.nodeType === 'route-folder')
    return { ...base, type: 'route-folder', config: { folderId: node.data.summary.replace(/^Folder: /, '') } };
  if (node.data.nodeType === 'condition') {
    const [field = 'title', contains = ''] = node.data.summary.split(' contains ');
    return { ...base, type: 'condition', config: { field: field as (typeof conditionFields)[number], contains } };
  }
  return {
    ...base,
    type: 'tag',
    config: {
      tags: node.data.summary
        .replace(/^Tags: /, '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    },
  };
}

function defaultFlowNode(type: ActionType, id: string, position: { x: number; y: number }): FlowNode {
  if (type === 'privacy') return { id, type, position, config: { private: true } };
  if (type === 'route-folder') return { id, type, position, config: { folderId: '' } };
  if (type === 'condition') return { id, type, position, config: { field: 'title', contains: 'screenshot' } };
  return { id, type, position, config: { tags: ['automated'] } };
}

function nodeTitle(type: FlowNode['type']) {
  if (type === 'route-folder') return 'Route folder';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function nodeSummary(node: FlowNode) {
  if (node.type === 'trigger') return node.config.triggerType;
  if (node.type === 'privacy') return node.config.private ? 'Private' : 'Public';
  if (node.type === 'route-folder') return `Folder: ${node.config.folderId}`;
  if (node.type === 'condition') return `${node.config.field} contains ${node.config.contains}`;
  return `Tags: ${node.config.tags.join(',')}`;
}

function parsePrivacy(summary: string) {
  return { private: summary === 'Private' };
}
