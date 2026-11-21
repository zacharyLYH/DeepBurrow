import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureBurrow } from "../packages/types/src/fixtures.ts";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";
import { demoCookie } from "./api-auth.ts";
import { seedDemo } from "./seed.ts";

export type TestApp = {
  call: (path: string, init?: RequestInit) => Promise<Response>;
  post: (path: string, body: unknown) => Promise<Response>;
  nodes: () => Promise<BurrowNode[]>;
};

export async function testApp(prefix: string): Promise<TestApp> {
  const dataDir = mkdtempSync(join(tmpdir(), prefix));
  process.env.DATA_DIR = dataDir;
  process.env.ALLOW_PRIVATE_PROVIDERS = "1";
  seedDemo(dataDir);
  const { app } = await import("../apps/api/src/server.ts");
  const cookie = await demoCookie(app);

  const call = async (path: string, init: RequestInit = {}) =>
    await app.fetch(
      new Request(`http://api${path}`, {
        ...init,
        headers: { cookie, ...(init.headers as Record<string, string> | undefined) },
      }),
    );

  return {
    call,
    post: (path, body) =>
      call(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    nodes: async () =>
      ((await (await call(`/burrows/${fixtureBurrow.id}`)).json()) as { nodes: BurrowNode[] })
        .nodes,
  };
}
