import "@xyflow/react/dist/style.css";
import { useEffect, useRef, useState } from "react";
import type { Node as BurrowNode } from "@deepburrow/types";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import { CARD_HEIGHT, CARD_WIDTH, layoutTree, type Position } from "@/lib/layout";
import { NodeCard, type CardNodeData } from "./node-card";

const nodeTypes = { card: NodeCard } as NodeTypes;

const MOBILE_QUERY = "(max-width: 640px)";
const FOLLOW_UP_DRAWER_HEIGHT = 96;

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setMobile(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

function CameraController({
  id,
  parentId,
  positions,
  compact,
}: {
  id?: string;
  parentId?: string | null;
  positions: Record<string, Position>;
  compact: boolean;
}) {
  const { setViewport } = useReactFlow();
  const seen = useRef(id);

  useEffect(() => {
    if (!id || id === seen.current || !positions[id]) return;
    seen.current = id;
    const boxes = [
      { ...positions[id], height: CARD_HEIGHT + FOLLOW_UP_DRAWER_HEIGHT },
      ...(!compact && parentId && positions[parentId]
        ? [{ ...positions[parentId], height: CARD_HEIGHT }]
        : []),
    ];
    const minX = Math.min(...boxes.map((box) => box.x));
    const minY = Math.min(...boxes.map((box) => box.y));
    const width = Math.max(...boxes.map((box) => box.x)) - minX + CARD_WIDTH;
    const height = Math.max(...boxes.map((box) => box.y + box.height)) - minY;
    const zoom = Math.min(1, (window.innerWidth - 48) / width, (window.innerHeight - 48) / height);
    void setViewport(
      {
        x: (window.innerWidth - width * zoom) / 2 - minX * zoom,
        y: (window.innerHeight - height * zoom) / 2 - minY * zoom,
        zoom,
      },
      { duration: 250 },
    );
  }, [id, parentId, positions, compact, setViewport]);

  return null;
}

type CanvasProps = {
  nodes: BurrowNode[];
  progress: Record<string, string[]>;
} & Omit<CardNodeData, "item" | "progress">;

export function Canvas({ nodes, progress, ...handlers }: CanvasProps) {
  const compact = useIsMobile();
  const positions = layoutTree(nodes, compact);
  const last = nodes.at(-1);

  const flowNodes = nodes.map((item) => ({
    id: item.id,
    type: "card",
    position: positions[item.id] ?? { x: 0, y: 0 },
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    data: { item, progress: progress[item.id] ?? [], ...handlers },
  }));

  const edges: Edge[] = nodes
    .filter((item) => item.parentId)
    .map((item) => ({
      id: `${item.parentId}-${item.id}`,
      source: item.parentId!,
      target: item.id,
      type: "smoothstep",
      style: { stroke: "var(--border)", strokeWidth: 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "var(--border)" },
    }));

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        Ask a question to start a burrow.
      </div>
    );
  }

  return (
    <div data-testid="canvas" className="h-full w-full">
      <ReactFlow
        key={compact ? "compact" : "wide"}
        nodes={flowNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        defaultViewport={
          compact
            ? { x: Math.max(12, (window.innerWidth - CARD_WIDTH) / 2), y: 24, zoom: 1 }
            : undefined
        }
        fitView={!compact}
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={compact ? 0.5 : 0.2}
        maxZoom={2}
      >
        <CameraController
          id={last?.id}
          parentId={last?.parentId}
          positions={positions}
          compact={compact}
        />
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
