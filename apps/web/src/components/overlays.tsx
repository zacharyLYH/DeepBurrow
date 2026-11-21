import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NewPageIcon } from "@/components/new-page-icon";

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

export function EmptyCanvas({ onNew }: { onNew: () => void }) {
  return (
    <div data-testid="empty-canvas" className="flex h-full items-center justify-center px-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-muted-foreground">Nothing on this canvas yet.</p>
        <Button data-testid="empty-new-burrow" size="sm" onClick={onNew}>
          <NewPageIcon />
          New burrow
        </Button>
      </div>
    </div>
  );
}
