import { useEffect, useMemo, useState } from "react";
import type { Node as BurrowNode } from "@deepburrow/types";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export type Command = { label: string; run: () => void };

type Props = {
  open: boolean;
  nodes: BurrowNode[];
  commands: Command[];
  onJump: (id: string) => void;
  onClose: () => void;
};

type Hit = { id: string; title: string; why: string };

// Title, origin question, selected passage and body all match.
function searchNodes(nodes: BurrowNode[], query: string): Hit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: Hit[] = [];
  for (const node of nodes) {
    const fields: [string, string | undefined][] = [
      ["title", node.title],
      ["question", node.origin.question],
      ["passage", node.origin.selectedText],
      ["body", node.markdown],
    ];
    const hit = fields.find(([, value]) => value?.toLowerCase().includes(needle));
    if (hit) hits.push({ id: node.id, title: node.title || "Untitled", why: hit[0] });
  }
  return hits.slice(0, 8);
}

export function Palette({ open, nodes, commands, onJump, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const hits = useMemo(() => searchNodes(nodes, query), [nodes, query]);
  const rows = query.trim()
    ? hits.map((hit) => ({ label: `${hit.title} · ${hit.why}`, run: () => onJump(hit.id) }))
    : commands;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
  }, [open]);

  const run = (index: number) => {
    const row = rows[index];
    if (!row) return;
    onClose();
    row.run();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="palette" aria-label="Command palette" className="p-0">
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <input
          autoFocus
          data-testid="palette-input"
          value={query}
          placeholder="Search cards or type a command"
          aria-label="Search cards"
          className="db-palette-input"
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setCursor((value) => Math.min(rows.length - 1, value + 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setCursor((value) => Math.max(0, value - 1));
            }
            if (event.key === "Enter") {
              event.preventDefault();
              run(cursor);
            }
          }}
        />
        <ul className="db-palette-list" role="listbox" aria-label="Results">
          {rows.map((row, index) => (
            <li key={`${row.label}-${index}`} role="option" aria-selected={index === cursor}>
              <button
                type="button"
                data-testid={`palette-row-${index}`}
                className={index === cursor ? "db-palette-row active" : "db-palette-row"}
                onMouseEnter={() => setCursor(index)}
                onClick={() => run(index)}
              >
                {row.label}
              </button>
            </li>
          ))}
          {rows.length === 0 && <li className="db-palette-empty">No match</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
