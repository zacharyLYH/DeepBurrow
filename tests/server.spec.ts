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

test("real server streams ordered events and persists the answer", async () => {
  const response = await post("/ask", {
    parentId: "node_root",
    ask: "Why double per RTT?",
    origin: { question: "Why double per RTT?" },
  });
  expect(response.headers.get("content-type")).toContain("text/event-stream");

  const events = parseStream(await response.text());
  expect(events[0].type).toBe("node.pending");
  expect(events.at(-1)?.type).toBe("node.done");

  const nodeId = events[0].nodeId;
  expect(nodeId).toMatch(/^[0-9a-f-]{36}$/);
  expect(events.every((event) => event.nodeId === nodeId)).toBe(true);

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
});

test("real server rejects an empty ask", async () => {
  expect((await post("/ask", { ask: "  " })).status).toBe(400);
});
