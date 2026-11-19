import { useState, type CSSProperties } from "react";
import type { Preset } from "@deepburrow/types";
import { presetFromKey } from "@/lib/settings";
import { POPOVER_WIDTH } from "@/lib/use-passage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  text: string;
  presets: Preset[];
  style: CSSProperties;
  onAsk: (question: string, preset?: Preset) => void;
  onClose: () => void;
};

export function AskPopover({ text, presets, style, onAsk, onClose }: Props) {
  const [question, setQuestion] = useState("");
  const submit = (preset?: Preset) => {
    if (!question.trim() && !preset) return;
    onAsk(question, preset);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        data-testid="ask-popover"
        style={{ ...style, width: POPOVER_WIDTH }}
        className="fixed z-50 rounded-lg border bg-card p-3 shadow-lg"
      >
        <p className="mb-2 line-clamp-2 text-xs text-muted-foreground">"{text}"</p>
        <Input
          autoFocus
          data-testid="ask-input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onClose();
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
            // Digits pick a preset only when the box is empty, so numbers type.
            const preset = presetFromKey(event.key, question, presets);
            if (preset) {
              event.preventDefault();
              submit(preset);
            }
          }}
          placeholder="Ask about selection"
          className="h-8"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {presets.map((preset, index) => (
            <Button
              key={`${preset.label}-${index}`}
              data-testid={`ask-preset-${index}`}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => submit(preset)}
            >
              {index + 1} {preset.label}
            </Button>
          ))}
          <Button data-testid="ask-submit" size="sm" className="h-7 px-2 text-xs" onClick={() => submit()}>
            Ask
          </Button>
        </div>
      </div>
    </>
  );
}
