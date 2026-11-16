import { useEffect, useRef, useState } from "react";
import type { Node as BurrowNode, NodeStatus, Preset, Source } from "@deepburrow/types";
import { Handle, Position, type Node as FlowNode, type NodeProps } from "@xyflow/react";
import { FollowUpDrawer } from "@/components/follow-up-drawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CARD_HEIGHT, CARD_WIDTH } from "@/lib/layout";
import { cn } from "@/lib/utils";

export type CardNodeData = {
  item: BurrowNode;
  progress: string[];
  onFollowUp: (id: string, preset?: Preset, text?: string) => void;
  onRetry: (id: string) => void;
  onStop: (id: string) => void;
  onSelect: (id: string) => void;
};

type CardFlowNode = FlowNode<CardNodeData, "card">;

const STATUS_DOT: Record<NodeStatus, string> = {
  pending: "bg-amber-500",
  answered: "bg-emerald-500",
  stopped: "bg-zinc-400",
  failed: "bg-red-500",
};

const hiddenHandle = "!size-0 !border-0 !bg-transparent";

function SourceLinks({ id, sources }: { id: string; sources: Source[] }) {
  return (
    <div
      data-testid={`sources-${id}`}
      className="flex shrink-0 flex-wrap gap-x-3 px-4 pb-1 text-xs"
    >
      {sources.map((source) => (
        <a
          key={source.url}
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-border underline-offset-2 hover:text-foreground"
        >
          {source.title}
        </a>
      ))}
    </div>
  );
}

function FollowUpChips({
  id,
  chips,
  onChip,
}: {
  id: string;
  chips: string[];
  onChip: (text: string) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap gap-1 px-4 pb-2">
      {chips.map((chip, index) => (
        <Button
          key={`${chip}-${index}`}
          data-testid={`chip-${id}-${index}`}
          size="xs"
          variant="outline"
          className="font-normal"
          onClick={() => onChip(chip)}
        >
          {chip}
        </Button>
      ))}
    </div>
  );
}

function FailedRow({ reason }: { reason: string }) {
  return (
    <div className="flex shrink-0 items-center border-t px-4 py-2">
      <span className="min-w-0 flex-1 truncate text-[11px] text-destructive">
        Failed: {reason}
      </span>
    </div>
  );
}

export function NodeCard({ data }: NodeProps<CardFlowNode>) {
  const { item, progress, onFollowUp, onRetry, onStop, onSelect } = data;
  const card = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { status } = item;
  const active = status === "pending";
  const canFollowUp = status === "answered" || status === "stopped";

  useEffect(() => {
    if (!canFollowUp) setDrawerOpen(false);
  }, [canFollowUp]);

  return (
    <div
      ref={card}
      data-testid={`card-${item.id}`}
      data-status={status}
      className="db-card relative"
      style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
    >
      <Card className="h-full gap-0 overflow-hidden py-0" onMouseUp={() => onSelect(item.id)}>
        <Handle type="target" position={Position.Top} isConnectable={false} className={hiddenHandle} />

        <div className="db-card-head">
          <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
          <h3 className="db-card-title" title={item.title}>
            {item.title}
          </h3>
          <div className="db-card-actions">
            {active && (
              <Button
                data-testid={`stop-${item.id}`}
                size="xs"
                variant="ghost"
                onClick={() => onStop(item.id)}
              >
                Stop
              </Button>
            )}
            {status === "failed" && (
              <Button
                data-testid={`retry-${item.id}`}
                size="xs"
                variant="ghost"
                onClick={() => onRetry(item.id)}
              >
                Retry
              </Button>
            )}
          </div>
        </div>

        <CardContent className="nodrag nopan min-h-0 flex-1 select-text overflow-y-auto overscroll-contain px-4 py-3 [mask-image:linear-gradient(to_bottom,black_88%,transparent)]">
          {status === "pending" && progress.length > 0 && (
            <ol
              data-testid={`progress-${item.id}`}
              className="space-y-1 pb-2 text-xs text-muted-foreground"
            >
              {progress.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          )}
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">{item.markdown}</p>
        </CardContent>

        {item.sources.length > 0 && <SourceLinks id={item.id} sources={item.sources} />}
        {status === "answered" && item.followups.length > 0 && (
          <FollowUpChips
            id={item.id}
            chips={item.followups}
            onChip={(chip) => {
              setDraft(chip);
              setDrawerOpen(true);
            }}
          />
        )}
        {status === "pending" && progress.length === 0 && !item.markdown && (
          <p className="shrink-0 px-4 pb-2 text-xs text-muted-foreground">Researching…</p>
        )}
        {status === "failed" && <FailedRow reason={item.error} />}

        <Handle type="source" position={Position.Bottom} isConnectable={false} className={hiddenHandle} />
      </Card>

      {canFollowUp && (
        <FollowUpDrawer
          item={item}
          text={draft}
          onTextChange={setDraft}
          open={drawerOpen}
          card={card}
          onOpenChange={setDrawerOpen}
          onFollowUp={onFollowUp}
        />
      )}
    </div>
  );
}
