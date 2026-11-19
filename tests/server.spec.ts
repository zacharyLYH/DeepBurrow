import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { parseEvent } from "../packages/types/src/header.ts";
import type { Event, Node as BurrowNode } from "../packages/types/src/types.ts";

let app: typeof import("../apps/api/src/server.ts")["app"];

test.beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "deepburrow-"));
  ({ app } = await import("../apps/api/src/server.ts"));
});

const post = (path: string, body: unknown) =>
  app.fetch(
    new Request(`http://api${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const parseStream = (text: string) =>
  text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => parseEvent(JSON.parse(chunk.replace(/^data: /, ""))) as Event);

const burrowNodes = async () =>
  ((await (await app.fetch(new Request("http://api/burrows/demo"))).json()) as {
    nodes: BurrowNode[];
  }).nodes;

// Starts an ask and returns the still-open response plus the pending node id.
const startAsk = async (ask: string) => {
  const before = new Set((await burrowNodes()).map((node) => node.id));
  const response = await post("/ask", {
    parentId: "node_root",
    origin: { question: ask },
  });
  const node = (await burrowNodes()).find((item) => !before.has(item.id));
  if (!node) throw new Error("no pending node");
  return { response, nodeId: node.id };
};

const stream = (nodeId: string) =>
  app.fetch(new Request(`http://api/nodes/${nodeId}/stream`));

// Reads the SSE body one event at a time, so the caller can observe the server
// mid-run. Hono's writer backpressures, so the run cannot race ahead unseen.
const eachEvent = async (response: Response, onEvent: (event: Event) => Promise<void>) => {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += value;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((item) => item.startsWith("data: "));
      if (line) await onEvent(parseEvent(JSON.parse(line.slice(6))) as Event);
    }
  }
};

test("real server streams ordered events and persists the answer", async () => {
  const response = await post("/ask", {
    parentId: "node_root",
    origin: { question: "Why double per RTT?" },
  });
  expect(response.headers.get("content-type")).toContain("text/event-stream");

  const events = parseStream(await response.text());
  expect(events[0].type).toBe("node.pending");
  expect(events.at(-1)?.type).toBe("node.done");

  const nodeId = events[0].nodeId;
  expect(nodeId).toMatch(/^[0-9a-f-]{36}$/);
  expect(events.every((event) => event.nodeId === nodeId)).toBe(true);

  const progress = events.flatMap((event) => (event.type === "node.progress" ? [event.line] : []));
  expect(progress[0]).toBe("Planning the research…");

  const metaAt = events.findIndex((event) => event.type === "node.meta");
  const firstTokenAt = events.findIndex((event) => event.type === "node.token");
  expect(metaAt).toBeGreaterThan(0);
  expect(firstTokenAt).toBeGreaterThan(metaAt);

  const meta = events[metaAt];
  if (meta.type !== "node.meta") throw new Error("no meta");
  expect(meta.title).toBe("Why double per RTT?");
  expect(meta.sources.length).toBeGreaterThan(0);

  const body = events
    .flatMap((event) => (event.type === "node.token" ? [event.text] : []))
    .join("");
  expect(body.trim().length).toBeGreaterThan(0);
  expect(body).not.toContain("TITLE:");
  expect(body).not.toContain("SOURCES:");

  const burrow = (await (await app.fetch(new Request("http://api/burrows/demo"))).json()) as {
    nodes: BurrowNode[];
  };
  const saved = burrow.nodes.find((node) => node.id === nodeId);
  expect(saved?.status).toBe("answered");
  expect(saved?.markdown).toBe(body);

  const done = events.at(-1);
  if (done?.type !== "node.done") throw new Error("no terminal node");
  expect(done.node.markdown).toBe(body);
  expect(done.node.status).toBe("answered");

  // Progress is live-only: it never reaches a stored node.
  expect(saved).not.toHaveProperty("progress");
});

test("a pending row exists mid-run and settles when the run ends", async () => {
  const response = await post("/ask", {
    parentId: "node_root",
    origin: { question: "When does the row land?" },
  });

  let nodeId = "";
  let sawPending = false;
  await eachEvent(response, async (event) => {
    nodeId ||= event.nodeId;
    if (event.type !== "node.pending") return;
    const saved = (await burrowNodes()).find((node) => node.id === nodeId);
    expect(saved?.status).toBe("pending");
    sawPending = true;
  });

  expect(sawPending).toBe(true);
  expect((await burrowNodes()).find((node) => node.id === nodeId)?.status).toBe("answered");
});

test("a second client attaches to a running node without a second run", async () => {
  const { response, nodeId } = await startAsk("Can someone watch?");
  const started = response.text();

  // Issued while the first request is still streaming: the run is live.
  const attached = parseStream(await (await stream(nodeId)).text());
  const done = attached.at(-1);
  if (done?.type !== "node.done") throw new Error("attach got no terminal");
  expect(done.node.id).toBe(nodeId);
  expect(done.node.status).toBe("answered");
  expect(done.node.markdown.length).toBeGreaterThan(0);
  expect(attached.some((event) => event.type === "node.token")).toBe(true);

  await started;
  expect((await burrowNodes()).filter((node) => node.id === nodeId)).toHaveLength(1);
});

test("attaching to a settled node replays its terminal node", async () => {
  const response = await post("/ask", {
    parentId: "node_root",
    origin: { question: "Replay after the fact?" },
  });
  const events = parseStream(await response.text());
  const done = events.at(-1);
  if (done?.type !== "node.done") throw new Error("no terminal event");
  const nodeId = done.node.id;

  const replay = parseStream(await (await stream(nodeId)).text());
  const again = replay.at(-1);
  if (again?.type !== "node.done") throw new Error("no replayed terminal");
  expect(again.node).toEqual(done.node);
});

test("attaching to an unknown node is 404", async () => {
  expect((await stream("does-not-exist")).status).toBe(404);
});

test("cancelling a run settles the node stopped", async () => {
  const { response, nodeId } = await startAsk("Cancel me?");
  const started = response.text();
  await app.fetch(new Request(`http://api/nodes/${nodeId}/cancel`, { method: "POST" }));
  await started;

  expect((await burrowNodes()).find((node) => node.id === nodeId)?.status).toBe("stopped");
});

test("cancelling an unknown node is a no-op", async () => {
  const response = await app.fetch(
    new Request("http://api/nodes/nope/cancel", { method: "POST" }),
  );
  expect(response.status).toBe(200);
});

test("real server rejects an empty ask", async () => {
  expect((await post("/ask", { origin: { question: "  " } })).status).toBe(400);
});

test("an answer with no text settles failed, keeps meta, and emits no tokens", async () => {
  const { response } = await startAsk("zzempty");
  const events = parseStream(await response.text());
  const done = events.at(-1);
  if (done?.type !== "node.error") throw new Error("no terminal event");

  expect(done.node.status).toBe("failed");
  expect(done.node.error).toBe("Empty answer");
  expect(done.node.markdown).toBe("");
  expect(done.node.sources.length).toBeGreaterThan(0);
  expect(events.some((event) => event.type === "node.token")).toBe(false);
});
