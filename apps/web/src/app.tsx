import { useState, type ReactNode } from "react";
import { AskPopover } from "@/components/ask-popover";
import { Canvas } from "@/components/canvas";
import { Button } from "@/components/ui/button";
import { useBurrow } from "@/lib/use-burrow";

// Single demo burrow until auth lands in M7.
const BURROW_ID = "demo";

type AskSelection = { sourceId: string; text: string; left: number; top: number };

// The popover is 320px wide (`w-80`); keep it inside the viewport with a gutter.
const POPOVER_WIDTH = 320;
const POPOVER_HEIGHT = 190;
const VIEWPORT_GUTTER = 12;

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function App() {
  const burrow = useBurrow(BURROW_ID);
  const [selection, setSelection] = useState<AskSelection | null>(null);

  const captureSelection = (sourceId: string) => {
    const selected = window.getSelection();
    const text = selected?.toString().trim();
    if (!text || !selected?.rangeCount) return;
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    const left = Math.min(
      Math.max(VIEWPORT_GUTTER, rect.left),
      window.innerWidth - POPOVER_WIDTH - VIEWPORT_GUTTER,
    );
    const top = Math.min(rect.bottom + 8, window.innerHeight - POPOVER_HEIGHT);
    setSelection({ sourceId, text, left, top });
  };

  if (burrow.loading) return <Notice>Loading burrow…</Notice>;
  if (burrow.loadError) {
    return (
      <Notice>
        Couldn&apos;t load the burrow.
        <Button size="sm" variant="outline" onClick={burrow.reload}>
          Retry
        </Button>
      </Notice>
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Canvas
        nodes={burrow.nodes}
        progress={burrow.progress}
        onFollowUp={burrow.followUp}
        onRetry={burrow.retry}
        onStop={burrow.stop}
        onSelect={captureSelection}
      />
      <div
        data-testid="burrow-title"
        className="pointer-events-none absolute left-4 top-3 z-10 hidden text-sm text-muted-foreground sm:block"
      >
        {burrow.title}
      </div>
      {selection && (
        <AskPopover
          text={selection.text}
          style={{ left: selection.left, top: selection.top }}
          onAsk={(question, preset) => {
            burrow.ask(selection.sourceId, question, preset, selection.text);
            setSelection(null);
          }}
          onClose={() => setSelection(null)}
        />
      )}
    </div>
  );
}
