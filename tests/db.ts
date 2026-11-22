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
export const readProviderRow = () =>
  read<{
    model_base_url: string | null;
    model_name: string | null;
    model_api_key_enc: Uint8Array | null;
  }>("SELECT model_base_url, model_name, model_api_key_enc FROM users WHERE id = ?", fixtureBurrow.userId);

export const readNodeRow = (id: string) =>
  read<{ title: string; deleted_at: number | null; position_x: number; position_y: number }>(
    "SELECT title, deleted_at, position_x, position_y FROM nodes WHERE id = ?",
    id,
  );

type SettingsRow = {
  theme: string;
  reading_size: number;
  presets_linked: number;
  selection_presets: string | null;
  followup_presets: string | null;
};

// Tests assert the stored columns directly, not a remapped shape.
export const readSettingsRow = () =>
  read<SettingsRow>(
    "SELECT theme, reading_size, presets_linked, selection_presets, followup_presets FROM users WHERE email = ?",
    demoCredentials.email,
  );

// Used by the one test that proves asking without a provider fails clearly.
export function clearProviders() {
  const db = new DatabaseSync(TEST_DB_PATH);
  try {
    db.prepare(
      "UPDATE users SET model_base_url = NULL, model_name = NULL, model_api_key_enc = NULL, search_base_url = NULL, search_model = NULL, search_api_key_enc = NULL",
    ).run();
  } finally {
    db.close();
  }
}

export function readViewport() {
  const row = read<{ viewport: string }>(
    "SELECT viewport FROM burrows WHERE id = ?",
    fixtureBurrow.id,
  );
  return JSON.parse(row?.viewport ?? "{}") as { x: number; y: number; zoom: number };
}
