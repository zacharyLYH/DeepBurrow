import type { Preset } from "@deepburrow/types";

export function buildAsk(question: string, preset?: Preset, selectedText?: string) {
  return [
    preset?.instruction,
    question.trim(),
    selectedText ? `Selected text: ${selectedText}` : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
