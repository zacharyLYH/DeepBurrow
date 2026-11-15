import { useState } from "react";
import { fixtureBurrow, fixtureNodes } from "@deepburrow/types";
import { AskPopover } from "@/components/ask-popover";
import { Canvas } from "@/components/canvas";
import { useBurrow } from "@/lib/use-burrow";

type AskSelection = { sourceId: string; text: string; left: number; top: number };

export function App() {
  const burrow = useBurrow(fixtureNodes);
  const [selection, setSelection] = useState<AskSelection | null>(null);

  const captureSelection = (sourceId: string) => {
    const selected = window.getSelection();
    const text = selected?.toString().trim();
    if (!text || !selected?.rangeCount) return;
    const rect = selected.getRangeAt(0).getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 332);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 190);
    setSelection({ sourceId, text, left, top });
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <Canvas
        nodes={burrow.nodes}
        drafts={burrow.drafts}
        onFollowUp={burrow.followUp}
        onRetry={burrow.retry}
        onStop={burrow.stop}
        onChip={burrow.fillDraft}
        onSelect={captureSelection}
      />
      <div
        data-testid="burrow-title"
        className="pointer-events-none absolute left-4 top-3 z-10 hidden text-sm text-muted-foreground sm:block"
      >
        {fixtureBurrow.title}
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
