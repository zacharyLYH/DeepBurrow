import { memo, useRef, useState, type CSSProperties } from "react";
import type { Node as BurrowNode, NodeStatus, Preset, Source } from "@deepburrow/types";
import { Handle, Position, type Node as FlowNode, type NodeProps } from "@xyflow/react";
import { FollowUpDrawer } from "@/components/follow-up-drawer";
import { Markdown, Skeleton } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { CARD_WIDTH } from "@/lib/layout";
import { useLiveContent } from "@/lib/live-content";
import { clampReading } from "@/lib/settings";
import { cn } from "@/lib/utils";

export type CardActions = {
  onFollowUp: (id: string, preset?: Preset, text?: string) => void;
  onRetry: (id: string) => void;
  onStop: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onCopyCard: (id: string) => void;
};

export type CardNodeData = {
  item: BurrowNode;
  presets: Preset[];
} & CardActions;

type CardFlowNode = FlowNode<CardNodeData, "card">;

const STATUS_DOT: Record<NodeStatus, string> = {
  pending: "bg-amber-500",
  answered: "bg-emerald-500",
  stopped: "bg-zinc-400",
  failed: "bg-red-500",
};

// Invisible DOM anchors on the header line: React Flow measures them directly.
const HANDLE_STYLE: CSSProperties = {
  top: 21,
  width: 1,
  height: 1,
  minWidth: 1,
  minHeight: 1,
  border: 0,
  opacity: 0,
  transform: "none",
};

function SourceLinks({ id, sources }: { id: string; sources: Source[] }) {
  return (
    <div data-testid={`sources-${id}`} className="flex shrink-0 flex-wrap gap-x-3 px-4 pb-1 text-xs">
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

function FollowUpChips({ id, chips, onChip }: { id: string; chips: string[]; onChip: (text: string) => void }) {
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

function CardBody({
  item,
  text,
  progress,
  fontScale,
}: {
  item: BurrowNode;
  text: string;
  progress: string[];
  fontScale: number;
}) {
  const streaming = item.status === "pending" && text.length > 0;
  return (
    <CardContent
      data-testid={`body-${item.id}`}
      className="nodrag nopan min-h-0 flex-1 select-text overflow-y-auto overscroll-contain px-4 py-3 [mask-image:linear-gradient(to_bottom,black_88%,transparent)]"
      style={{ fontSize: `calc(var(--db-reading) * ${fontScale})` }}
    >
      {item.origin.selectedText && (
        <div className="db-origin-quote">
          <p data-testid={`reference-${item.id}`}>“{item.origin.selectedText}”</p>
          {(item.origin.question || item.origin.preset?.label) && (
            <p data-testid={`origin-${item.id}`}>
              {item.origin.question || item.origin.preset?.label}
            </p>
          )}
        </div>
      )}
      {item.status === "pending" && !text && progress.length > 0 && (
        <ol data-testid={`progress-${item.id}`} className="space-y-1 pb-2 text-xs text-muted-foreground">
          {progress.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ol>
      )}
      {item.status === "pending" && !text ? (
        <Skeleton>{progress.length === 0 && <span className="db-stalled">Researching…</span>}</Skeleton>
      ) : (
        <>
          <Markdown text={text} />
          {streaming && <span data-testid={`caret-${item.id}`} className="db-caret" />}
        </>
      )}
    </CardContent>
  );
}

function CardMenu({
  data,
  scale,
  onScale,
  onRenameStart,
}: {
  data: CardNodeData;
  scale: number;
  onScale: (next: number | "reset") => void;
  onRenameStart: () => void;
}) {
  const { item } = data;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button data-testid={`menu-${item.id}`} size="xs" variant="ghost" aria-label="Card menu">
          ⋯
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid={`menu-panel-${item.id}`}>
        <DropdownMenuItem data-testid={`copy-${item.id}`} onSelect={() => data.onCopyCard(item.id)}>
          Copy as Markdown
        </DropdownMenuItem>
        <DropdownMenuItem data-testid={`rename-${item.id}`} onSelect={onRenameStart}>
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="db-menu-row">
          <span>Text size</span>
          <div className="flex items-center gap-1">
            <Button
              data-testid={`font-down-${item.id}`}
              size="xs"
              variant="outline"
              aria-label="Smaller text"
              onClick={() => onScale(clampReading(scale - 0.1))}
            >
              −
            </Button>
            <Button
              data-testid={`font-reset-${item.id}`}
              size="xs"
              variant="ghost"
              aria-label="Reset text size"
              onClick={() => onScale("reset")}
            >
              {Math.round(scale * 100)}%
            </Button>
            <Button
              data-testid={`font-up-${item.id}`}
              size="xs"
              variant="outline"
              aria-label="Larger text"
              onClick={() => onScale(clampReading(scale + 0.1))}
            >
              +
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          data-testid={`delete-${item.id}`}
          className="text-destructive"
          onSelect={() => data.onDelete(item.id)}
        >
          Delete branch
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Cards size to their content, so there is no frame to drag.

// Data identity is stable per card, so memo only rerenders changed cards.
export const NodeCard = memo(function NodeCard({ data }: NodeProps<CardFlowNode>) {
  const { item, presets } = data;
  const live = useLiveContent(item.id);
  const text = live.text || item.markdown;
  const card = useRef<HTMLDivElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [fontScale, setFontScale] = useState(1);
  // A rename draft is the editable state: null means "show the stored title".
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const { status } = item;
  const active = status === "pending";
  const canFollowUp = status === "answered" || status === "stopped";

  const commitTitle = () => {
    if (titleDraft === null) return;
    const next = titleDraft.trim();
    setTitleDraft(null);
    if (next && next !== item.title) data.onRename(item.id, next);
  };

  return (
    <div
      ref={card}
      data-testid={`card-${item.id}`}
      data-card-id={item.id}
      data-status={status}
      data-root={item.parentId === null ? "true" : "false"}
      className="db-card relative flex flex-col"
      style={{ width: CARD_WIDTH }}
    >
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={false}
        style={HANDLE_STYLE}
      />
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={false}
        style={HANDLE_STYLE}
      />
      <Card className="min-h-0 flex-1 gap-0 overflow-hidden py-0">
        <div className="db-card-head">
          <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT[status])} />
          {item.parentId === null && <span className="db-root-badge">Root</span>}
          {titleDraft !== null ? (
            <Input
              autoFocus
              data-testid={`rename-input-${item.id}`}
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitTitle();
                if (event.key === "Escape") setTitleDraft(null);
              }}
              className="h-6 min-w-0 flex-1 px-1 text-sm"
            />
          ) : (
            <h3 className="db-card-title" title={item.title}>
              {item.title}
            </h3>
          )}
          <div className="db-card-actions">
            {active && (
              <Button data-testid={`stop-${item.id}`} size="xs" variant="ghost" onClick={() => data.onStop(item.id)}>
                Stop
              </Button>
            )}
            {status === "failed" && (
              <Button data-testid={`retry-${item.id}`} size="xs" variant="ghost" onClick={() => data.onRetry(item.id)}>
                Retry
              </Button>
            )}
            <CardMenu
              data={data}
              scale={fontScale}
              onScale={(next) => setFontScale(next === "reset" ? 1 : next)}
              onRenameStart={() => setTitleDraft(item.title)}
            />
          </div>
        </div>

        <CardBody
          item={item}
          text={text}
          progress={live.progress}
          fontScale={fontScale}
        />

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
        {status === "failed" && (
          <div className="flex shrink-0 items-center border-t px-4 py-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-destructive">
              Failed: {item.error}
            </span>
          </div>
        )}
      </Card>

      {canFollowUp && (
        <FollowUpDrawer
          item={item}
          presets={presets}
          text={draft}
          onTextChange={setDraft}
          open={drawerOpen && canFollowUp}
          card={card}
          onOpenChange={setDrawerOpen}
          onFollowUp={data.onFollowUp}
        />
      )}
    </div>
  );
});
