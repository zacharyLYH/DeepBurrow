import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono, type Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import { buildAsk, titleFromOrigin } from "../../../packages/types/src/header.ts";
import type { Event, Node, Origin, Viewport } from "../../../packages/types/src/types.ts";
import {
  DEMO_BURROW,
  deleteBranch,
  getBurrow,
  getNode,
  putNode,
  patchNode,
  readSettings,
  restoreBranch,
  writeSettings,
  writeViewport,
} from "./db.ts";
import { cancelRun, getRun, startRun, subscribe, type Run } from "./runs.ts";

type AskBody = {
  nodeId?: string;
  parentId?: string | null;
  origin?: Origin;
};

const MAX_TITLE = 80;

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

const relay = (c: Context, run: Run, nodeId: string) =>
  streamSSE(c, async (stream) => {
    attach(stream, run);
    await run.done;
    const node = getNode(nodeId);
    if (node) await stream.writeSSE({ data: JSON.stringify(settled(node)) });
  });

export const app = new Hono();

app.get("/health", (c) => c.text("ok"));

app.get("/burrows/:id", (c) => {
  const burrow = getBurrow(c.req.param("id"));
  return burrow ? c.json(burrow) : c.json({ error: "not found" }, 404);
});

// Prompts and appearance live on the user row until auth lands in M7.
app.get("/settings", (c) => c.json({ settings: readSettings() }));

app.patch("/settings", async (c) => {
  const patch = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!patch) return c.json({ error: "settings required" }, 400);
  return c.json({ settings: writeSettings(patch) });
});

// The client only ever writes a title or a flow position for a node.
type NodePatch = { title?: unknown; position?: unknown };

const isCoords = (value: unknown): value is { x: number; y: number } => {
  if (typeof value !== "object" || value === null) return false;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === "number" && typeof y === "number" && Number.isFinite(x) && Number.isFinite(y);
};

const isViewport = (value: unknown): value is Viewport =>
  isCoords(value) && Number.isFinite((value as Viewport).zoom);

app.patch("/nodes/:id", async (c) => {
  const body = await c.req.json<NodePatch>().catch(() => ({}) as NodePatch);
  const patch: { title?: string; position?: { x: number; y: number } } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return c.json({ error: "title required" }, 400);
    if (title.length > MAX_TITLE) return c.json({ error: "title too long" }, 400);
    patch.title = title;
  }
  if (body.position !== undefined) {
    if (!isCoords(body.position)) return c.json({ error: "bad position" }, 400);
    patch.position = { x: body.position.x, y: body.position.y };
  }
  if (!patch.title && !patch.position) return c.json({ error: "nothing to patch" }, 400);

  const node = patchNode(c.req.param("id"), patch);
  return node ? c.json({ node }) : c.json({ error: "node not found" }, 404);
});

app.patch("/burrows/:id", async (c) => {
  const body = await c.req.json<{ viewport?: unknown }>().catch(() => ({}) as { viewport?: unknown });
  if (!isViewport(body.viewport)) return c.json({ error: "bad viewport" }, 400);
  const burrow = writeViewport(c.req.param("id"), body.viewport);
  return burrow ? c.json({ burrow }) : c.json({ error: "burrow not found" }, 404);
});

// Soft delete: the node and its descendants disappear, undo restores the group.
app.delete("/nodes/:id", (c) => {
  const ids = deleteBranch(c.req.param("id"));
  if (!ids) return c.json({ error: "node not found" }, 404);
  for (const id of ids) cancelRun(id);
  return c.json({ ids });
});

app.post("/nodes/:id/restore", (c) => {
  const ids = restoreBranch(c.req.param("id"));
  return ids.length ? c.json({ ids }) : c.json({ error: "not deleted" }, 404);
});

app.post("/ask", async (c) => {
  const body = await c.req.json<AskBody>();

  const existing = body.nodeId ? getNode(body.nodeId) : null;
  if (body.nodeId && !existing) return c.json({ error: "node not found" }, 404);

  // Retry reuses the stored parent; only a new ask picks one.
  const parentId = existing ? existing.parentId : (body.parentId ?? null);
  const parent = parentId ? getNode(parentId) : null;
  if (parentId && !parent) return c.json({ error: "parent not found" }, 404);

  const burrowId = existing?.burrowId ?? parent?.burrowId ?? getBurrow(DEMO_BURROW)?.burrow.id;
  if (!burrowId) return c.json({ error: "burrow not found" }, 404);

  // A new ask supplies the origin; a retry keeps the one already on the row.
  const origin = existing?.origin ?? body.origin;
  if (!origin) return c.json({ error: "origin required" }, 400);
  const ask = buildAsk(origin);
  if (!ask.trim()) return c.json({ error: "ask required" }, 400);

  // New cards land to the right of their parent; the client then centers them.
  const parentPosition = parent?.position ?? { x: 0, y: 0 };
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
    position: existing?.position ?? {
      x: parent ? parentPosition.x + 344 : 0,
      y: parent ? parentPosition.y : 0,
    },
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  putNode(node);

  return relay(c, startRun(node, ask), node.id);
});

// Reattach to a run after a refresh, or replay a row that already settled.
app.get("/nodes/:id/stream", (c) => {
  const nodeId = c.req.param("id");
  const run = getRun(nodeId);

  if (run) return relay(c, run, nodeId);

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
