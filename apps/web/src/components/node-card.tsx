import type { Node as BurrowNode, NodeStatus } from "@deepburrow/types";
import { Handle, Position, type Node as FlowNode, type NodeProps } from "@xyflow/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CardData = { item: BurrowNode };
export type CardNode = FlowNode<CardData, "card">;

const dot: Record<NodeStatus, string> = {
  pending: "bg-amber-500",
  streaming: "bg-sky-500",
  answered: "bg-emerald-500",
  failed: "bg-red-500",
};

export function NodeCard({ data }: NodeProps<CardNode>) {
  const { item } = data;
  return (
    <Card
      data-testid={`card-${item.id}`}
      className="h-[172px] w-[320px] select-none overflow-hidden"
    >
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={false}
        className="!size-0 !border-0 !bg-transparent"
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className={cn("size-2 shrink-0 rounded-full", dot[item.status])} />
          <span className="truncate">{item.title}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,black_80%,transparent)]">
        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{item.markdown}</p>
      </CardContent>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className="!size-0 !border-0 !bg-transparent"
      />
    </Card>
  );
}
