import { parseEvent } from "@deepburrow/types";
import type { Event, Origin } from "@deepburrow/types";

type Ask = {
  nodeId?: string;
  parentId: string | null;
  ask: string;
  origin: Origin;
};

export async function streamAsk(input: Ask, signal: AbortSignal, onEvent: (event: Event) => void) {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (data) onEvent(parseEvent(JSON.parse(data.slice(6))));
    }
  }
}
