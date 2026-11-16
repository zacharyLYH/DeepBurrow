import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";

// A slow run must not hang forever: the registry aborts it and settles `failed`.
const DATA_DIR = mkdtempSync(join(tmpdir(), "deepburrow-timeout-"));
const PORT = 9000 + Math.floor(Math.random() * 90);
const URL = `http://127.0.0.1:${PORT}`;

let api: ChildProcess | undefined;

test.beforeAll(async () => {
  api = spawn(process.execPath, ["apps/api/src/server.ts"], {
    env: {
      ...process.env,
      DATA_DIR,
      PORT: String(PORT),
      FAKE_LATENCY_MS: "800",
      RUN_TIMEOUT_MS: "100",
    },
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
});

test.afterAll(() => {
  api?.kill("SIGKILL");
  rmSync(DATA_DIR, { recursive: true, force: true });
});

test("a run that outlives its deadline settles failed", async () => {
  const response = await fetch(`${URL}/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      parentId: "node_root",
      ask: "Will this ever finish?",
      origin: { question: "Will this ever finish?" },
    }),
  });
  const text = await response.text();

  expect(text).toContain('"type":"node.error"');
  expect(text).toContain('"status":"failed"');
  expect(text).toContain("Timed out");

  const burrow = (await (await fetch(`${URL}/burrows/demo`)).json()) as { nodes: BurrowNode[] };
  const node = burrow.nodes.find((item) => item.origin.question === "Will this ever finish?");
  expect(node?.status).toBe("failed");
  expect(node?.error).toBe("Timed out");
});
