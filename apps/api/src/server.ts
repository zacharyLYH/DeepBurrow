import { randomUUID } from "node:crypto";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { titleFromAsk } from "../../../packages/types/src/header.ts";
import type { Event, Meta, Node as BurrowNode, NodeStatus, Origin } from "../../../packages/types/src/types.ts";
import { DEMO_BURROW, getBurrow, getNode, lineage, putNode } from "./db.ts";
import { buildGraph, type GraphChunk } from "./graph.ts";
import { fakeModel } from "./model.ts";

const graph = buildGraph(fakeModel);

// View-layer pacing so tokens land one at a time like a real stream.
const TOKEN_PACE_MS = Number(process.env.FAKE_PACE_MS ?? 18);

type AskBody = { nodeId?: string; parentId?: string | null; ask?: string; origin?: Origin };

const nodeTitle = (origin: Origin) =>
  titleFromAsk(origin.question) || origin.preset?.label || "New branch";

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : "Failed");

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

  const origin = body.origin ?? existing?.origin ?? { question: ask };
  const now = Date.now();
  const record: BurrowNode = {
    id: existing?.id ?? randomUUID(),
    burrowId,
    parentId,
    title: nodeTitle(origin),
    markdown: "",
    origin,
    sources: [],
    followups: [],
    status: "pending",
    error: "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  putNode(record);

  return streamSSE(c, async (stream) => {
    const send = (event: Event) => stream.writeSSE({ data: JSON.stringify(event) });
    let answer = "";
    let meta: Meta = { title: record.title, sources: [], followups: [] };

    const finish = (status: NodeStatus, error = "") =>
      putNode({ ...record, ...meta, markdown: answer, status, error, updatedAt: Date.now() });

    try {
      await send({ nodeId: record.id, type: "node.pending" });
      const events = await graph.stream(
        { ask, lineage: parentId ? lineage(parentId) : "" },
        { streamMode: "custom", signal: c.req.raw.signal },
      );

      for await (const chunk of events as AsyncIterable<GraphChunk>) {
        if (stream.aborted) throw new Error("Client went away");
        if (chunk.type === "meta") {
          meta = { title: chunk.title, sources: chunk.sources, followups: chunk.followups };
          await send({ nodeId: record.id, type: "node.meta", ...meta });
          continue;
        }
        answer += chunk.text;
        await send({ nodeId: record.id, type: "node.token", text: chunk.text });
        await stream.sleep(TOKEN_PACE_MS);
      }

      await send({ nodeId: record.id, type: "node.done" });
      finish("answered");
    } catch (error) {
      const stopped = stream.aborted || c.req.raw.signal.aborted;
      finish(stopped ? "stopped" : "failed", stopped ? "" : reasonOf(error));
      if (!stopped) {
        await send({ nodeId: record.id, type: "node.error", reason: reasonOf(error) }).catch(() => {});
      }
    }
  });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  serve({ fetch: app.fetch, port }, () => console.log(`api on http://localhost:${port}`));
}
