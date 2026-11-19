import { useCallback, useEffect, useState } from "react";

export type Passage = {
  sourceId: string;
  text: string;
  left: number;
  top: number;
};

// The popover is this wide (see ask-popover); keep it inside the viewport with
// a gutter.
export const POPOVER_WIDTH = 320;
const POPOVER = { width: POPOVER_WIDTH, height: 190, gutter: 12 };
// Long enough to finish a drag, short enough to feel live on touch.
const DEBOUNCE = 200;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

// Selection is the one ask path on every device: no hover, no right click.
export function usePassageSelection() {
  const [passage, setPassage] = useState<Passage | null>(null);

  const capture = useCallback(
    (sourceId: string) => {
      const selected = window.getSelection();
      const text = selected?.toString().trim();
      if (!text || !selected?.rangeCount) return;

      const rect = selected.getRangeAt(0).getBoundingClientRect();
      setPassage({
        sourceId,
        text,
        left: clamp(
          rect.left,
          POPOVER.gutter,
          window.innerWidth - POPOVER.width - POPOVER.gutter,
        ),
        top: Math.min(rect.bottom + 8, window.innerHeight - POPOVER.height),
      });
    },
    [],
  );

  useEffect(() => {
    let timer: number | undefined;
    const onChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const selected = window.getSelection();
        if (!selected || selected.isCollapsed) return;
        const anchor = selected.anchorNode;
        const element = anchor instanceof Element ? anchor : anchor?.parentElement;
        const sourceId = element?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
        if (sourceId) capture(sourceId);
      }, DEBOUNCE);
    };
    document.addEventListener("selectionchange", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.clearTimeout(timer);
    };
  }, [capture]);

  const clearPassage = useCallback(() => setPassage(null), []);
  return { passage, clearPassage };
}
