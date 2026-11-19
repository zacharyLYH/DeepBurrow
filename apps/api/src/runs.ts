import type { Event, Meta, Node } from "../../../packages/types/src/types.ts";
import { lineage, putNode } from "./db.ts";
import { buildGraph, type GraphChunk } from "./graph.ts";
import { fakeModel } from "./model.ts";

const graph = buildGraph(fakeModel());

// View-layer pacing so tokens land one at a time like a real stream.
const TOKEN_PACE_MS = Number(process.env.FAKE_PACE_MS ?? 18);
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS ?? 120_000);

type Subscriber = (event: Event) => Promise<void>;

export type Run = {
  userId: string;
  nodeId: string;
  abort: AbortController;
  subscribers: Set<Subscriber>;
  done: Promise<void>;
};

// A run lives here, not in the request, so a refresh can reattach to it.
const activeRuns = new Map<string, Run>();

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : "Failed");

const save = (userId: string, node: Node, patch: Partial<Node>): Node => {
  const next = { ...node, ...patch, updatedAt: Date.now() };
  putNode(userId, next);
  return next;
};

async function broadcast(run: Run, event: Event) {
  for (const subscriber of run.subscribers) await subscriber(event);
}

async function execute(run: Run, node: Node, ask: string) {
  const timer = setTimeout(() => run.abort.abort("timeout"), RUN_TIMEOUT_MS);
  let meta: Meta = { title: node.title, sources: [], followups: [] };
  let answer = "";

  try {
    // The first event carries the stored row, so the client never guesses at
    // placement, title or defaults.
    await broadcast(run, { nodeId: node.id, type: "node.pending", node });

    const events = await graph.stream(
      { nodeId: node.id, ask, lineage: node.parentId ? lineage(run.userId, node.parentId) : "" },
      { streamMode: "custom", signal: run.abort.signal },
    );

    for await (const chunk of events as AsyncIterable<GraphChunk>) {
      // The graph can finish producing before we finish pacing tokens; abort here
      // too, so stop and timeout still cut the visible stream.
      if (run.abort.signal.aborted) throw run.abort.signal.reason;
      if (chunk.type === "meta") {
        meta = { title: chunk.title, sources: chunk.sources, followups: chunk.followups };
        await broadcast(run, { nodeId: node.id, type: "node.meta", ...meta });
      } else if (chunk.type === "progress") {
        await broadcast(run, { nodeId: node.id, type: "node.progress", line: chunk.line });
      } else {
        answer += chunk.text;
        await broadcast(run, { nodeId: node.id, type: "node.token", text: chunk.text });
        await new Promise((resolve) => setTimeout(resolve, TOKEN_PACE_MS));
      }
    }

    // An answer with no text is a failed run, not an empty card: retry is the
    // only way forward, and the stored meta (title, sources) is kept.
    if (!answer.trim()) throw new Error("Empty answer");

    save(run.userId, node, { ...meta, markdown: answer, status: "answered", error: "" });
  } catch (cause) {
    const why = run.abort.signal.reason;
    const status = why === "cancel" ? "stopped" : "failed";
    const error = why === "cancel" ? "" : why === "timeout" ? "Timed out" : reasonOf(cause);
    save(run.userId, node, { ...meta, markdown: answer, status, error });
  } finally {
    clearTimeout(timer);
    if (activeRuns.get(node.id) === run) activeRuns.delete(node.id);
  }
}

export function startRun(userId: string, node: Node, ask: string): Run {
  const run: Run = {
    userId,
    nodeId: node.id,
    abort: new AbortController(),
    subscribers: new Set(),
    done: Promise.resolve(),
  };
  activeRuns.set(node.id, run);
  // Let the starter subscribe before the first event is emitted.
  run.done = Promise.resolve().then(() => execute(run, node, ask));
  return run;
}

export const getRun = (userId: string, nodeId: string) => {
  const run = activeRuns.get(nodeId);
  return run?.userId === userId ? run : undefined;
};

export function subscribe(run: Run, subscriber: Subscriber) {
  run.subscribers.add(subscriber);
  return () => {
    run.subscribers.delete(subscriber);
  };
}

export function cancelRun(userId: string, nodeId: string) {
  const run = getRun(userId, nodeId);
  if (run) run.abort.abort("cancel");
}
