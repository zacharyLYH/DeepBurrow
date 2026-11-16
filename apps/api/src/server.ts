import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { titleFromOrigin } from "../../../packages/types/src/header.ts";
import type { Event, Node, Origin } from "../../../packages/types/src/types.ts";
import { DEMO_BURROW, getBurrow, getNode, putNode } from "./db.ts";
import { cancelRun, getRun, startRun, subscribe, type Run } from "./runs.ts";

type AskBody = {
  nodeId?: string;
  parentId?: string | null;
  ask?: string;
  origin?: Origin;
};

const settled = (node: Node): Event => ({
  nodeId: node.id,
  type: node.status === "answered" ? "node.done" : "node.error",
  node,
});

function attach(stream: SSEStreamingApi, run: Run) {
  const unsubscribe = subscribe(run, async (event) => {
    await stream.writeSSE({ data: JSON.stringify(event) });
  });
  stream.onAbort(unsubscribe);
}

async function finish(stream: SSEStreamingApi, nodeId: string) {
  const node = getNode(nodeId);
  if (node) await stream.writeSSE({ data: JSON.stringify(settled(node)) });
}

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.get("/burrows/:id", (c) => {
  const burrow = getBurrow(c.req.param("id"));
  return burrow ? c.json(burrow) : c.json({ error: "not found" }, 404);
});

app.post("/ask", async (c) => {
  const body = await c.req.json<AskBody>();
  const ask = body.ask?.trim();
  if (!ask) return c.json({ error: "ask required" }, 400);

  const existing = body.nodeId ? getNode(body.nodeId) : null;
  if (body.nodeId && !existing) return c.json({ error: "node not found" }, 404);

  // Retry reuses the stored parent; only a new ask picks one.
  const parentId = existing ? existing.parentId : (body.parentId ?? null);
  const parent = parentId ? getNode(parentId) : null;
  if (parentId && !parent) return c.json({ error: "parent not found" }, 404);

  const burrowId = existing?.burrowId ?? parent?.burrowId ?? getBurrow(DEMO_BURROW)?.burrow.id;
  if (!burrowId) return c.json({ error: "burrow not found" }, 404);

  // A new ask supplies the origin; a retry keeps the one already on the row.
  const origin = existing ? existing.origin : (body.origin ?? { question: ask });

  const node: Node = {
    id: existing?.id ?? randomUUID(),
    burrowId,
    parentId,
    title: titleFromOrigin(origin),
    markdown: "",
    origin,
    sources: [],
    followups: [],
    status: "pending",
    error: "",
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  putNode(node);

  const run = startRun(node, ask);
  return streamSSE(c, async (stream) => {
    attach(stream, run);
    await run.done;
    await finish(stream, node.id);
  });
});

// Reattach to a run after a refresh, or replay a row that already settled.
app.get("/nodes/:id/stream", (c) => {
  const nodeId = c.req.param("id");
  const run = getRun(nodeId);

  if (run) {
    return streamSSE(c, async (stream) => {
      attach(stream, run);
      await run.done;
      await finish(stream, nodeId);
    });
  }

  const stored = getNode(nodeId);
  if (!stored) return c.json({ error: "node not found" }, 404);

  // No run means it died with an earlier process; settle the leftover row.
  const node =
    stored.status === "pending"
      ? { ...stored, status: "stopped" as const, updatedAt: Date.now() }
      : stored;
  if (node !== stored) putNode(node);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify(settled(node)) });
  });
});

app.post("/nodes/:id/cancel", (c) => {
  cancelRun(c.req.param("id"));
  return c.json({ ok: true });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, () => console.log(`api on http://localhost:${port}`));
}
