import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Coords, Node as BurrowNode, Preset, Viewport } from "@deepburrow/types";
import {
  Background,
  MarkerType,
  ReactFlow,
  type Edge,
  type Node as FlowNode,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { NodeCard, type CardActions, type CardNodeData } from "@/components/node-card";
import { CARD_HEIGHT, CARD_WIDTH, descendantsOf } from "@/lib/layout";

const nodeTypes = { card: NodeCard } as NodeTypes;

type Props = {
  nodes: BurrowNode[];
  presets: Preset[];
  actions: CardActions;
  onMove: (id: string, position: Coords) => void;
  onMoveEnd: (viewport: Viewport) => void;
  viewport: Viewport;
  onReady: () => void;
};

export function Canvas({
  nodes,
  presets,
  actions,
  onMove,
  onMoveEnd,
  viewport,
  onReady,
}: Props) {
  const [pos, setPos] = useState<Record<string, Coords>>({});
  // Coordinates are server-owned; the local copy only spans the drag itself.
  const posRef = useRef(pos);
  posRef.current = pos;

  // Stored layout is the source of truth; drag only overrides it until release.
  useEffect(() => setPos({}), [nodes]);

  const branch = useRef<{
    ids: string[];
    anchor: Coords;
    base: Map<string, Coords>;
  } | null>(null);

  // React Flow owns drag updates; the server owns the persisted position.
  const onNodesChange = useCallback((changes: NodeChange<FlowNode<CardNodeData>>[]) => {
    setPos((current) => {
      let next: Record<string, Coords> | null = null;
      for (const change of changes) {
        if (change.type !== "position" || !change.position) continue;
        next ??= { ...current };
        next[change.id] = change.position;
      }
      return next ?? current;
    });
  }, []);

  const onNodeDragStart = (event: MouseEvent | TouchEvent, node: FlowNode<CardNodeData>) => {
    branch.current =
      "shiftKey" in event && event.shiftKey
        ? {
            ids: descendantsOf(nodes, node.id),
            anchor: { ...node.position },
            base: new Map(nodes.map((item) => [item.id, item.position])),
          }
        : null;
  };

  // Shift-drag carries the whole branch: descendants inherit the anchor delta.
  const onNodeDrag = (_event: MouseEvent | TouchEvent, node: FlowNode<CardNodeData>) => {
    const active = branch.current;
    if (!active) return;
    const dx = node.position.x - active.anchor.x;
    const dy = node.position.y - active.anchor.y;
    setPos((current) => {
      const next = { ...current, [node.id]: node.position };
      for (const id of active.ids) {
        const base = active.base.get(id);
        if (base) next[id] = { x: base.x + dx, y: base.y + dy };
      }
      return next;
    });
  };

  const onNodeDragStop = (_event: MouseEvent | TouchEvent, node: FlowNode<CardNodeData>) => {
    const active = branch.current;
    branch.current = null;
    onMove(node.id, node.position);
    for (const id of active?.ids ?? []) {
      const at = posRef.current[id];
      if (at) onMove(id, at);
    }
  };

  const known = new Set(nodes.map((node) => node.id));

  // Data identity is stable per card, so React Flow skips unchanged cards when
  // the node list rebuilds for a drag or stream.
  const cache = useRef(new Map<string, { actions: CardActions; data: CardNodeData }>());
  for (const id of cache.current.keys()) if (!known.has(id)) cache.current.delete(id);
  const dataFor = (item: BurrowNode): CardNodeData => {
    const found = cache.current.get(item.id);
    if (found?.actions === actions && found.data.item === item && found.data.presets === presets) {
      return found.data;
    }
    const data: CardNodeData = { item, presets, ...actions };
    cache.current.set(item.id, { actions, data });
    return data;
  };

  const flowNodes = nodes.map((item): FlowNode<CardNodeData> => {
    return {
      id: item.id,
      type: "card",
      position: pos[item.id] ?? item.position,
      // Seed size: the camera and first paint have geometry before measurement.
      measured: { width: CARD_WIDTH, height: CARD_HEIGHT },
      initialWidth: CARD_WIDTH,
      initialHeight: CARD_HEIGHT,
      dragHandle: ".db-card-head",
      data: dataFor(item),
    };
  });

  const edges: Edge[] = nodes.flatMap((item) => {
    const parentId = item.parentId;
    if (!parentId || !known.has(parentId)) return [];
    return [
      {
        id: `${parentId}-${item.id}`,
        source: parentId,
        target: item.id,
        type: "smoothstep",
        style: { stroke: "var(--muted-foreground)", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" },
      },
    ];
  });

  return (
    <div data-testid="canvas" className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        // The camera is restored exactly, never fitted.
        defaultViewport={viewport}
        onInit={onReady}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onMoveEnd={(_event, next) => onMoveEnd(next)}
        nodesConnectable={false}
        // Shift is ours: it drags a branch, so React Flow must not treat it as
        // a selection modifier.
        selectionKeyCode={null}
        multiSelectionKeyCode={null}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
      </ReactFlow>
    </div>
  );
}
