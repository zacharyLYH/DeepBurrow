import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const KEYS: [string, string][] = [
  ["⌘K / Ctrl+K", "Search cards and run commands"],
  ["?", "This list"],
  ["Esc", "Close palette, settings, popover or drawer"],
  ["1–3", "Submit a preset from the popover or drawer"],
  ["Shift+drag", "Move a whole branch"],
];

export function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="shortcuts"
        aria-label="Keyboard shortcuts"
        className="top-1/2 w-[400px] -translate-y-1/2 p-4"
      >
        <DialogTitle className="mb-2 text-sm font-semibold">Shortcuts</DialogTitle>
        <dl>
          {KEYS.map(([key, action]) => (
            <div key={key} className="db-shortcut-row">
              <dt>{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <Button size="xs" variant="outline" className="mt-3" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export function EntryComposer({ onSubmit }: { onSubmit: (question: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <div data-testid="entry-composer" className="flex h-full items-center justify-center px-6 pb-24">
      <div className="w-full max-w-xl rounded-xl border bg-card p-3 shadow-sm">
        <Textarea
          autoFocus
          data-testid="entry-input"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Ask a question to start this burrow"
          className="resize-none border-0 shadow-none focus-visible:ring-0"
        />
        <div className="flex justify-end">
          <Button data-testid="entry-submit" size="sm" onClick={submit}>
            Ask
          </Button>
        </div>
      </div>
    </div>
  );
}
