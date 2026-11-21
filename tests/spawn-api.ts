import { spawn } from "node:child_process";

export type SpawnedApi = { url: string; stop: () => Promise<void> };

export async function startApi(options: {
  dataDir: string;
  port: number;
  env?: Record<string, string>;
}): Promise<SpawnedApi> {
  const url = `http://127.0.0.1:${options.port}`;
  const child = spawn(process.execPath, ["apps/api/src/server.ts"], {
    env: {
      ...process.env,
      DATA_DIR: options.dataDir,
      PORT: String(options.port),
      // The seeded provider is the loopback HTTP mock.
      ALLOW_PRIVATE_PROVIDERS: "1",
      ...options.env,
    },
    stdio: "ignore",
  });

  const stop = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill("SIGKILL");
    await exited;
  };

  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`${url}/health`)).ok) return { url, stop };
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await stop();
  throw new Error("api did not start");
}
