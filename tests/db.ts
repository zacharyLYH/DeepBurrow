import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { demoCredentials, fixtureBurrow } from "../packages/types/src/fixtures.ts";
import { seedDemo } from "./seed.ts";

// Keep in sync with the webServer DATA_DIR in playwright.config.ts. Workspace
// scripts run from apps/api, so DATA_DIR resolves under that package.
export const TEST_DB_PATH = join(process.cwd(), "apps/api/data/test/deepburrow.db");

// Full reseed: fixtures are the only rows, so renames, deletes, positions and
// settings from earlier specs cannot leak into the next one.
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// An in-flight run saves its node when it settles, which would resurrect a row
// deleted mid-run. Wait for quiet first, so every spec starts from the fixtures.
function settle(db: DatabaseSync) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = db.prepare("SELECT count(*) AS n FROM nodes WHERE status = 'pending'").get() as {
      n: number;
    };
    if (row.n === 0) return;
    sleep(50);
  }
}

export function resetDemoBurrow() {
  const db = new DatabaseSync(TEST_DB_PATH);
  settle(db);
  db.exec("PRAGMA foreign_keys = ON");
  db.prepare("DELETE FROM users WHERE id != ?").run(fixtureBurrow.userId);
  db.close();
  seedDemo(dirname(TEST_DB_PATH));
}

const read = <T>(sql: string, ...params: (string | number)[]) => {
  const db = new DatabaseSync(TEST_DB_PATH);
  try {
    return db.prepare(sql).get(...params) as T | undefined;
  } finally {
    db.close();
  }
};

// Tests that assert on server rows (rename, delete, position) read them here.
export const readNodeRow = (id: string) =>
  read<{ title: string; deleted_at: number | null; position_x: number; position_y: number }>(
    "SELECT title, deleted_at, position_x, position_y FROM nodes WHERE id = ?",
    id,
  );

// Theme, reading size and presets live on the user row, not in the browser.
export function readSettings() {
  const row = read<{ settings: string }>(
    "SELECT settings FROM users WHERE email = ?",
    demoCredentials.email,
  );
  return JSON.parse(row?.settings ?? "{}") as Record<string, unknown>;
}

export function readViewport() {
  const row = read<{ viewport: string }>(
    "SELECT viewport FROM burrows WHERE id = ?",
    fixtureBurrow.id,
  );
  return JSON.parse(row?.viewport ?? "{}") as { x: number; y: number; zoom: number };
}
