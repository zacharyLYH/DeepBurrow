import type { Event, Meta, Node } from "../../../packages/types/src/types.ts";
import { lineage, putNode } from "./db.ts";
import { buildGraph, type GraphChunk } from "./graph.ts";
import { fakeModel } from "./model.ts";

const graph = buildGraph(fakeModel());

// View-layer pacing so tokens land one at a time like a real stream.
const TOKEN_PACE_MS = Number(process.env.FAKE_PACE_MS ?? 18);
const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS ?? 120_000);

export type Subscriber = (event: Event) => Promise<void>;

export type Run = {
  nodeId: string;
  abort: AbortController;
  subscribers: Set<Subscriber>;
  done: Promise<void>;
};

// A run lives here, not in the request, so a refresh can reattach to it.
const activeRuns = new Map<string, Run>();

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : "Failed");

const save = (node: Node, patch: Partial<Node>): Node => {
  const next = { ...node, ...patch, updatedAt: Date.now() };
  putNode(next);
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
    await broadcast(run, { nodeId: node.id, type: "node.pending" });

    const events = await graph.stream(
      { nodeId: node.id, ask, lineage: node.parentId ? lineage(node.parentId) : "" },
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

    save(node, { ...meta, markdown: answer, status: "answered", error: "" });
  } catch (cause) {
    const why = run.abort.signal.reason;
    const status = why === "cancel" ? "stopped" : "failed";
    const error = why === "cancel" ? "" : why === "timeout" ? "Timed out" : reasonOf(cause);
    save(node, { ...meta, markdown: answer, status, error });
  } finally {
    clearTimeout(timer);
    if (activeRuns.get(node.id) === run) activeRuns.delete(node.id);
  }
}

export function startRun(node: Node, ask: string): Run {
  const run: Run = {
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

export const getRun = (nodeId: string) => activeRuns.get(nodeId);

export function subscribe(run: Run, subscriber: Subscriber) {
  run.subscribers.add(subscriber);
  return () => {
    run.subscribers.delete(subscriber);
  };
}

export function cancelRun(nodeId: string) {
  activeRuns.get(nodeId)?.abort.abort("cancel");
}
