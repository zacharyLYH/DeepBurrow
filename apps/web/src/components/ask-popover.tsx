import { useState, type CSSProperties } from "react";
import type { Preset } from "@deepburrow/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PRESETS } from "@/lib/presets";

type Props = {
  text: string;
  style: CSSProperties;
  onAsk: (question: string, preset?: Preset) => void;
  onClose: () => void;
};

export function AskPopover({ text, style, onAsk, onClose }: Props) {
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
        style={style}
        className="fixed z-50 w-80 rounded-lg border bg-card p-3 shadow-lg"
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
            const index = Number(event.key) - 1;
            if (index >= 0 && index < PRESETS.length) {
              event.preventDefault();
              submit(PRESETS[index]);
            }
          }}
          placeholder="Ask about selection"
          className="h-8"
        />
        <div className="mt-2 flex flex-wrap gap-1">
          {PRESETS.map((preset, index) => (
            <Button
              key={preset.label}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => submit(preset)}
            >
              {index + 1} {preset.label}
            </Button>
          ))}
          <Button
            data-testid="ask-submit"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => submit()}
          >
            Ask
          </Button>
        </div>
      </div>
    </>
  );
}
