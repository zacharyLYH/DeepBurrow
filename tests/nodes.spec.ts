import { expect, test } from "@playwright/test";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";
import { testApp, type TestApp } from "./app-harness.ts";

// The graph additions, exercised through the real Hono app.
let api: TestApp;

test.beforeAll(async () => {
  api = await testApp("deepburrow-nodes-");
});

const call = (path: string, method = "GET", body?: unknown) =>
  api.call(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

test("rename trims, rejects blanks and persists", async () => {
  const response = await call("/nodes/node_why", "PATCH", { title: "  Why it doubles  " });
  expect(response.status).toBe(200);
  expect(((await response.json()) as { node: BurrowNode }).node.title).toBe("Why it doubles");

  const saved = (await api.nodes()).find((node) => node.id === "node_why");
  expect(saved?.title).toBe("Why it doubles");

  expect((await call("/nodes/node_why", "PATCH", { title: "   " })).status).toBe(400);
  expect((await call("/nodes/nope", "PATCH", { title: "x" })).status).toBe(404);
});

test("delete takes the branch out of every read and restore brings it back", async () => {
  const deleted = await call("/nodes/node_root", "DELETE");
  expect(deleted.status).toBe(200);
  const { ids } = (await deleted.json()) as { ids: string[] };
  expect(ids.sort()).toEqual(["node_cubic", "node_long", "node_root", "node_why"]);

  // Reads filter soft-deleted rows, so the burrow is empty but the rows remain.
  expect(await api.nodes()).toEqual([]);
  expect((await call("/nodes/node_root/stream")).status).toBe(404);
  expect(
    (await call("/ask", "POST", { parentId: "node_root", origin: { question: "orphan" } })).status,
  ).toBe(404);

  const restored = await call("/nodes/node_root/restore", "POST");
  expect(restored.status).toBe(200);
  expect(((await restored.json()) as { ids: string[] }).ids).toHaveLength(4);
  expect((await api.nodes()).map((node) => node.id).sort()).toEqual(ids.sort());

  // Nothing left to restore.
  expect((await call("/nodes/node_root/restore", "POST")).status).toBe(404);
});

test("deleting one card leaves its siblings", async () => {
  expect((await call("/nodes/node_why", "DELETE")).status).toBe(200);
  expect((await api.nodes()).map((node) => node.id)).toEqual(["node_root", "node_cubic", "node_long"]);
  await call("/nodes/node_why/restore", "POST");
  expect((await api.nodes()).map((node) => node.id)).toEqual([
    "node_root",
    "node_why",
    "node_cubic",
    "node_long",
  ]);
});

test("settings merge on the user row", async () => {
  expect(((await (await call("/settings")).json()) as { settings: unknown }).settings).toEqual({
    theme: "light",
    readingSize: 1,
    presets: { link: false },
  });

  const first = await call("/settings", "PATCH", {
    theme: "dark",
    presets: { link: true, selection: [], followUp: [] },
  });
  expect(first.status).toBe(200);

  const second = (await (await call("/settings", "PATCH", { readingSize: 1.2 })).json()) as {
    settings: Record<string, unknown>;
  };
  expect(second.settings).toEqual({
    theme: "dark",
    readingSize: 1.2,
    presets: { link: true, selection: [], followUp: [] },
  });

  // A later read sees the same row.
  const read = (await (await call("/settings")).json()) as { settings: Record<string, unknown> };
  expect(read.settings.theme).toBe("dark");
});
