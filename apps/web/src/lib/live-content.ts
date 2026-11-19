import { useCallback, useSyncExternalStore } from "react";

// Streamed text and progress, keyed by node. Never part of a Node row: it
// overlays the card until the server's settled markdown lands, then drops.
export type LiveContent = { text: string; progress: string[] };

const EMPTY: LiveContent = { text: "", progress: [] };
const entries = new Map<string, LiveContent>();
const listeners = new Map<string, Set<() => void>>();
const queued = new Map<string, LiveContent>();
let frame = 0;

const emit = (id: string) => listeners.get(id)?.forEach((listener) => listener());

// Tokens arrive faster than frames; coalesce a batch into one render per card.
const flush = () => {
  frame = 0;
  for (const [id, next] of queued) {
    const current = entries.get(id) ?? EMPTY;
    entries.set(id, {
      text: current.text + next.text,
      progress: next.progress.length ? [...current.progress, ...next.progress] : current.progress,
    });
    emit(id);
  }
  queued.clear();
};

const enqueue = (id: string, change: (next: LiveContent) => void) => {
  const next = { text: "", progress: [], ...queued.get(id) };
  change(next);
  queued.set(id, next);
  if (!frame) frame = requestAnimationFrame(flush);
};

export const liveContent = {
  read: (id: string) => entries.get(id) ?? EMPTY,
  subscribe: (id: string, listener: () => void) => {
    const set = listeners.get(id) ?? new Set<() => void>();
    set.add(listener);
    listeners.set(id, set);
    return () => {
      set.delete(listener);
      if (!set.size) listeners.delete(id);
    };
  },
  token: (id: string, text: string) => enqueue(id, (next) => void (next.text += text)),
  progress: (id: string, line: string) => enqueue(id, (next) => void next.progress.push(line)),
  reset: (id: string) => {
    queued.delete(id);
    if (entries.delete(id)) emit(id);
  },
};

export function useLiveContent(id: string) {
  return useSyncExternalStore(
    useCallback((listener) => liveContent.subscribe(id, listener), [id]),
    () => liveContent.read(id),
  );
}
