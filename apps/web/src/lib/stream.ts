import { parseEvent } from "@deepburrow/types";
import type { Event, Origin } from "@deepburrow/types";

export type AskInput = {
  nodeId?: string;
  parentId: string | null;
  origin: Origin;
};

async function readEvents(
  response: Response,
  onEvent: (event: Event) => void,
): Promise<void> {
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const data = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (data) onEvent(parseEvent(JSON.parse(data.slice(6))));
    }
  }
}

export async function ask(input: AskInput, signal: AbortSignal, onEvent: (event: Event) => void) {
  const response = await fetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  await readEvents(response, onEvent);
}

export async function attach(nodeId: string, signal: AbortSignal, onEvent: (event: Event) => void) {
  await readEvents(await fetch(`/api/nodes/${nodeId}/stream`, { signal }), onEvent);
}

export function cancel(nodeId: string) {
  return fetch(`/api/nodes/${nodeId}/cancel`, { method: "POST" });
}
