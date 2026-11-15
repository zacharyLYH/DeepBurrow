import "@xyflow/react/dist/style.css";
import { useEffect, useMemo, useState } from "react";
import type { Node as BurrowNode } from "@deepburrow/types";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import { layoutTree } from "@/lib/layout";
import { NodeCard, type CardNode } from "./node-card";

const nodeTypes = { card: NodeCard } as NodeTypes;

const MOBILE_QUERY = "(max-width: 640px)";

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

export function Canvas({ nodes }: { nodes: BurrowNode[] }) {
  const compact = useIsMobile();
  const positions = useMemo(() => layoutTree(nodes, compact), [nodes, compact]);

  const flowNodes: CardNode[] = nodes.map((item) => ({
    id: item.id,
    type: "card",
    position: positions[item.id] ?? { x: 0, y: 0 },
    data: { item },
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
            ? { x: Math.max(12, (window.innerWidth - 320) / 2), y: 24, zoom: 1 }
            : undefined
        }
        fitView={!compact}
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={compact ? 0.5 : 0.2}
        maxZoom={2}
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
