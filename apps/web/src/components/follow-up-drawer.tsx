import { useEffect, useRef, type RefObject } from "react";
import type { Node as BurrowNode, Preset } from "@deepburrow/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PRESETS } from "@/lib/presets";
import { cn } from "@/lib/utils";

const MAX_INPUT_HEIGHT = 90;

// Grow to fit the text up to the cap, then scroll. A fixed rows=1 base keeps the
// card body from moving while the drawer animates.
function autoGrow(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(MAX_INPUT_HEIGHT, textarea.scrollHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > MAX_INPUT_HEIGHT ? "auto" : "hidden";
}

type FollowUpDrawerProps = {
  item: BurrowNode;
  text: string;
  onTextChange: (text: string) => void;
  open: boolean;
  card: RefObject<HTMLDivElement | null>;
  onOpenChange: (open: boolean) => void;
  onFollowUp: (id: string, preset?: Preset, text?: string) => void;
};

export function FollowUpDrawer({
  item,
  text,
  onTextChange,
  open,
  card,
  onOpenChange,
  onFollowUp,
}: FollowUpDrawerProps) {
  const input = useRef<HTMLTextAreaElement>(null);
  const handle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    autoGrow(input.current);
  }, [text, open]);

  useEffect(() => {
    if (open) input.current?.focus({ preventScroll: true });
  }, [open]);

  const close = () => {
    onOpenChange(false);
    requestAnimationFrame(() => handle.current?.focus({ preventScroll: true }));
  };

  const submit = (preset?: Preset) => {
    if (!text.trim() && !preset) return;
    onFollowUp(item.id, preset, text);
    onTextChange("");
    onOpenChange(false);
  };

  return (
    <div
      data-testid={`drawer-${item.id}`}
      className={cn("db-follow-up-drawer", open && "open", text.trim() && "has-draft")}
    >
      <div className="db-follow-up-clip">
        <div className="db-follow-up-panel p-2">
          <Textarea
            ref={input}
            data-testid={`drawer-input-${item.id}`}
            rows={1}
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close();
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            onBlur={() => {
              if (!text.trim() && !card.current?.matches(":hover")) onOpenChange(false);
            }}
            placeholder="Ask follow-up"
            className="min-h-0 resize-none rounded-none border-0 bg-transparent px-2 py-1 text-sm leading-snug shadow-none focus-visible:ring-0"
          />
          <div className="mt-1 flex gap-1">
            {PRESETS.map((preset) => (
              <Button key={preset.label} size="xs" variant="ghost" onClick={() => submit(preset)}>
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <Button
        ref={handle}
        type="button"
        variant="ghost"
        data-testid={`drawer-handle-${item.id}`}
        aria-expanded={open}
        aria-controls={`drawer-${item.id}`}
        className="db-follow-up-handle hover:bg-transparent"
        onClick={() => onOpenChange(true)}
      >
        <span className="db-follow-up-plus">+</span> Ask follow-up
      </Button>
    </div>
  );
}
