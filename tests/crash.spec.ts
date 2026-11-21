import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { fixtureBurrow } from "../packages/types/src/fixtures.ts";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";
import { remoteCookie } from "./api-auth.ts";
import { seedDemo } from "./seed.ts";
import { startApi, type SpawnedApi } from "./spawn-api.ts";

// A run lives only in memory. Kill the process mid-run and its pending row is
// dead weight; reattaching from a fresh process settles it to stopped.
const DATA_DIR = mkdtempSync(join(tmpdir(), "deepburrow-crash-"));
const PORT = 8900 + Math.floor(Math.random() * 90);
const URL = `http://127.0.0.1:${PORT}`;

let api: SpawnedApi | undefined;
let cookie = "";

const start = async () => {
  api = await startApi({ dataDir: DATA_DIR, port: PORT });
};

const signIn = async () => {
  if (!cookie) cookie = await remoteCookie(URL);
};

const stop = () => api?.stop();

test.beforeAll(() => seedDemo(DATA_DIR));

test.afterAll(async () => {
  await stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

test("a crashed run is settled when a client reattaches", async () => {
  await start();
  await signIn();

  const response = await fetch(`${URL}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      parentId: "node_root",
      // zzslow keeps the mock mid-answer while the process is killed.
      origin: { question: "zzslow crash card?" },
    }),
  });
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  const { value } = await reader.read();
  expect(value).toContain("node.pending");
  const nodeId = /"nodeId":"([^"]+)"/.exec(value ?? "")?.[1];
  expect(nodeId).toBeTruthy();

  // Mid-plan: the pending row exists and the fake model is still sleeping.
  await stop();

  // The run died with the process; reattaching settles the leftover row.
  await start();
  await signIn();
  const before = (await (await fetch(`${URL}/burrows/${fixtureBurrow.id}`, { headers: { cookie } })).json()) as { nodes: BurrowNode[] };
  expect(before.nodes.find((node) => node.id === nodeId)?.status).toBe("pending");

  const stream = await fetch(`${URL}/nodes/${nodeId}/stream`, { headers: { cookie } });
  expect(await stream.text()).toContain('"node.error"');

  const after = (await (await fetch(`${URL}/burrows/${fixtureBurrow.id}`, { headers: { cookie } })).json()) as { nodes: BurrowNode[] };
  expect(after.nodes.find((node) => node.id === nodeId)?.status).toBe("stopped");
});
