import { parseEvent } from "./header.ts";
import type { Event } from "./types.ts";

const eventFrom = (frame: string): Event | null => {
  const line = frame.split("\n").find((item) => item.startsWith("data: "));
  return line ? parseEvent(JSON.parse(line.slice(6))) : null;
};

export const parseEvents = (text: string): Event[] =>
  text.split("\n\n").flatMap((frame) => {
    const event = eventFrom(frame);
    return event ? [event] : [];
  });

// Reads one SSE response frame by frame, so callers can act mid-run.
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: Event) => void | Promise<void>,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = eventFrom(frame);
        if (event) await onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
