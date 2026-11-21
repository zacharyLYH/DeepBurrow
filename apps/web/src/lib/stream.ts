import { readEventStream } from "@deepburrow/types";
import type { Event, Origin } from "@deepburrow/types";
import { apiFetch } from "./api";

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
  await readEventStream(response.body, onEvent);
}

export async function ask(input: AskInput, signal: AbortSignal, onEvent: (event: Event) => void) {
  const response = await apiFetch("/api/ask", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  await readEvents(response, onEvent);
}

export async function attach(nodeId: string, signal: AbortSignal, onEvent: (event: Event) => void) {
  await readEvents(await apiFetch(`/api/nodes/${nodeId}/stream`, { signal }), onEvent);
}

export function cancel(nodeId: string) {
  return apiFetch(`/api/nodes/${nodeId}/cancel`, { method: "POST" });
}
