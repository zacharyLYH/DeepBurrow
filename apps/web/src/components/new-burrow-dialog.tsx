import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (question: string) => Promise<string | null>;
};

export function NewBurrowDialog({ open, onOpenChange, onCreate }: Props) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const question = text.trim();
    if (!question) {
      setError("Ask a question or paste a link.");
      return;
    }
    setPending(true);
    setError("");
    const failure = await onCreate(question);
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent data-testid="new-burrow-dialog" aria-describedby={undefined} aria-label="New burrow">
        <DialogTitle className="border-b px-4 py-3 text-sm font-semibold">New burrow</DialogTitle>
        <div className="space-y-3 p-4">
          <Textarea
            autoFocus
            data-testid="new-burrow-input"
            value={text}
            rows={3}
            placeholder="Ask a question or paste a link to start this burrow…"
            className="resize-none"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <p className="text-xs text-muted-foreground">Questions and links both work.</p>
          {error && (
            <p data-testid="new-burrow-error" role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button data-testid="new-burrow-submit" size="sm" disabled={pending} onClick={() => void submit()}>
              {pending ? "Starting…" : "Start"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
