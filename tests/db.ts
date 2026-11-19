import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";

// Keep in sync with the webServer DATA_DIR in playwright.config.ts. Workspace
// scripts run from apps/api, so DATA_DIR resolves under that package.
const DB_PATH = join(process.cwd(), "apps/api/data/test/deepburrow.db");

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
  const db = new DatabaseSync(DB_PATH);
  settle(db);
  db.exec("DELETE FROM nodes");
  const insert = db.prepare(
    `INSERT INTO nodes
       (id, burrow_id, parent_id, title, markdown, origin, sources, followups, status, error,
        position_x, position_y, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const node of fixtureNodes) {
    insert.run(
      node.id,
      node.burrowId,
      node.parentId,
      node.title,
      node.markdown,
      JSON.stringify(node.origin),
      JSON.stringify(node.sources),
      JSON.stringify(node.followups),
      node.status,
      node.error,
      node.position.x,
      node.position.y,
      node.createdAt,
      node.updatedAt,
    );
  }
  db.prepare("UPDATE burrows SET viewport = ?").run(JSON.stringify(fixtureBurrow.viewport));
  db.exec("UPDATE users SET settings = '{}'");
  db.close();
}

// Tests that assert on server rows (rename, delete, position) read them here.
export function readNodeRow(id: string) {
  const db = new DatabaseSync(DB_PATH);
  const row = db.prepare("SELECT title, deleted_at, position_x, position_y FROM nodes WHERE id = ?").get(id) as
    | { title: string; deleted_at: number | null; position_x: number; position_y: number }
    | undefined;
  db.close();
  return row;
}

// Theme, reading size and presets live on the user row, not in the browser.
export function readSettings() {
  const db = new DatabaseSync(DB_PATH);
  const row = db
    .prepare("SELECT settings FROM users ORDER BY created_at LIMIT 1")
    .get() as { settings: string } | undefined;
  db.close();
  return JSON.parse(row?.settings ?? "{}") as Record<string, unknown>;
}

export function readViewport() {
  const db = new DatabaseSync(DB_PATH);
  const row = db
    .prepare(
      "SELECT viewport FROM burrows WHERE id = (SELECT id FROM burrows ORDER BY created_at LIMIT 1)",
    )
    .get() as { viewport: string } | undefined;
  db.close();
  return JSON.parse(row?.viewport ?? "{}") as { x: number; y: number; zoom: number };
}
