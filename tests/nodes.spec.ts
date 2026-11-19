import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { fixtureBurrow } from "../packages/types/src/fixtures.ts";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";
import { demoCookie } from "./api-auth.ts";
import { seedDemo } from "./seed.ts";

// The M5 graph additions, exercised through the real Hono app.
let app: typeof import("../apps/api/src/server.ts")["app"];
let cookie = "";

test.beforeAll(async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "deepburrow-nodes-"));
  process.env.DATA_DIR = dataDir;
  seedDemo(dataDir);
  ({ app } = await import("../apps/api/src/server.ts"));
  cookie = await demoCookie(app);
});

const call = (path: string, method = "GET", body?: unknown) =>
  app.fetch(
    new Request(`http://api${path}`, {
      method,
      headers: {
        cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );

const nodes = async () =>
  ((await (await call(`/burrows/${fixtureBurrow.id}`)).json()) as { nodes: BurrowNode[] }).nodes;

test("rename trims, rejects blanks and persists", async () => {
  const response = await call("/nodes/node_why", "PATCH", { title: "  Why it doubles  " });
  expect(response.status).toBe(200);
  expect(((await response.json()) as { node: BurrowNode }).node.title).toBe("Why it doubles");

  const saved = (await nodes()).find((node) => node.id === "node_why");
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
  expect(await nodes()).toEqual([]);
  expect((await call("/nodes/node_root/stream")).status).toBe(404);
  expect(
    (await call("/ask", "POST", { parentId: "node_root", origin: { question: "orphan" } })).status,
  ).toBe(404);

  const restored = await call("/nodes/node_root/restore", "POST");
  expect(restored.status).toBe(200);
  expect(((await restored.json()) as { ids: string[] }).ids).toHaveLength(4);
  expect((await nodes()).map((node) => node.id).sort()).toEqual(ids.sort());

  // Nothing left to restore.
  expect((await call("/nodes/node_root/restore", "POST")).status).toBe(404);
});

test("deleting one card leaves its siblings", async () => {
  expect((await call("/nodes/node_why", "DELETE")).status).toBe(200);
  expect((await nodes()).map((node) => node.id)).toEqual(["node_root", "node_cubic", "node_long"]);
  await call("/nodes/node_why/restore", "POST");
  expect((await nodes()).map((node) => node.id)).toEqual([
    "node_root",
    "node_why",
    "node_cubic",
    "node_long",
  ]);
});

test("settings merge on the user row", async () => {
  expect(((await (await call("/settings")).json()) as { settings: unknown }).settings).toEqual({});

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
