import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";

// A run lives only in memory. Kill the process mid-run and its pending row is
// dead weight; reattaching from a fresh process settles it to stopped.
const DATA_DIR = mkdtempSync(join(tmpdir(), "deepburrow-crash-"));
const PORT = 8900 + Math.floor(Math.random() * 90);
const URL = `http://127.0.0.1:${PORT}`;

let api: ChildProcess | undefined;

const start = async () => {
  api = spawn(process.execPath, ["apps/api/src/server.ts"], {
    env: { ...process.env, DATA_DIR, PORT: String(PORT), FAKE_LATENCY_MS: "1500" },
    stdio: "ignore",
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${URL}/health`)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("api did not start");
};

const stop = async () => {
  if (!api || api.exitCode !== null || api.signalCode !== null) return;
  const exited = new Promise((resolve) => api!.once("exit", resolve));
  api.kill("SIGKILL");
  await exited;
};

test.afterAll(async () => {
  await stop();
  rmSync(DATA_DIR, { recursive: true, force: true });
});

test("a crashed run is settled when a client reattaches", async () => {
  await start();

  const response = await fetch(`${URL}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentId: "node_root",
      ask: "Does a crash leave a card?",
      origin: { question: "Does a crash leave a card?" },
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
  const before = (await (await fetch(`${URL}/burrows/demo`)).json()) as { nodes: BurrowNode[] };
  expect(before.nodes.find((node) => node.id === nodeId)?.status).toBe("pending");

  const stream = await fetch(`${URL}/nodes/${nodeId}/stream`);
  expect(await stream.text()).toContain('"node.error"');

  const after = (await (await fetch(`${URL}/burrows/demo`)).json()) as { nodes: BurrowNode[] };
  expect(after.nodes.find((node) => node.id === nodeId)?.status).toBe("stopped");
});
