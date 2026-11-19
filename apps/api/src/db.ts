import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { fixtureBurrow, fixtureNodes } from "../../../packages/types/src/fixtures.ts";
import type {
  Burrow,
  Coords,
  Node,
  NodeStatus,
  Origin,
  Viewport,
} from "../../../packages/types/src/types.ts";

// "demo" is the only burrow until auth lands in M7.
export const DEMO_BURROW = "demo";

type BurrowRow = {
  id: string;
  user_id: string;
  title: string;
  viewport: string;
  created_at: number;
  updated_at: number;
};

type NodeRow = {
  id: string;
  burrow_id: string;
  parent_id: string | null;
  title: string;
  markdown: string;
  origin: string;
  sources: string;
  followups: string;
  status: NodeStatus;
  error: string;
  position_x: number;
  position_y: number;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
};

const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "deepburrow.db"));
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

const migrations = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));
for (const file of readdirSync(migrations).sort()) db.exec(readFileSync(`${migrations}${file}`, "utf8"));

const toBurrow = (row: BurrowRow): Burrow => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  viewport: JSON.parse(row.viewport) as Viewport,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toNode = (row: NodeRow): Node => ({
  id: row.id,
  burrowId: row.burrow_id,
  parentId: row.parent_id,
  title: row.title,
  markdown: row.markdown,
  origin: JSON.parse(row.origin) as Origin,
  sources: JSON.parse(row.sources) as Node["sources"],
  followups: JSON.parse(row.followups) as string[],
  status: row.status,
  error: row.error,
  position: { x: row.position_x, y: row.position_y },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const upsertNode = db.prepare(
  `INSERT INTO nodes (id, burrow_id, parent_id, title, markdown, origin, sources, followups, status, error, position_x, position_y, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     parent_id = excluded.parent_id, title = excluded.title, markdown = excluded.markdown,
     origin = excluded.origin, sources = excluded.sources, followups = excluded.followups,
     status = excluded.status, error = excluded.error,
     position_x = excluded.position_x, position_y = excluded.position_y,
     updated_at = excluded.updated_at`,
);

export function putNode(node: Node) {
  upsertNode.run(
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

// Deleted rows stay in the table for restore, but never reach a normal read.
export function getNode(id: string): Node | null {
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as NodeRow | undefined;
  return row && row.deleted_at === null ? toNode(row) : null;
}

// Demo resolves to the first burrow; everything else by id.
const burrowRow = (id: string) =>
  (id === DEMO_BURROW
    ? db.prepare("SELECT * FROM burrows ORDER BY created_at LIMIT 1").get()
    : db.prepare("SELECT * FROM burrows WHERE id = ?").get(id)) as BurrowRow | undefined;

export function getBurrow(id: string): { burrow: Burrow; nodes: Node[] } | null {
  const row = burrowRow(id);
  if (!row) return null;
  const burrow = toBurrow(row);
  const nodes = db
    .prepare("SELECT * FROM nodes WHERE burrow_id = ? AND deleted_at IS NULL ORDER BY created_at, id")
    .all(burrow.id) as NodeRow[];
  return { burrow, nodes: nodes.map(toNode) };
}

// One camera per burrow, shared by every device.
export function writeViewport(id: string, viewport: Viewport): Burrow | null {
  const row = burrowRow(id);
  if (!row) return null;
  const json = JSON.stringify(viewport);
  db.prepare("UPDATE burrows SET viewport = ?, updated_at = ? WHERE id = ?").run(json, Date.now(), row.id);
  return toBurrow({ ...row, viewport: json });
}

// Presets, theme and reading size belong to the user row.
export function readSettings(): Record<string, unknown> {
  const row = db.prepare("SELECT settings FROM users ORDER BY created_at LIMIT 1").get() as
    | { settings: string }
    | undefined;
  try {
    return JSON.parse(row?.settings ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeSettings(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...readSettings(), ...patch };
  db.prepare(
    "UPDATE users SET settings = ? WHERE id = (SELECT id FROM users ORDER BY created_at LIMIT 1)",
  ).run(JSON.stringify(next));
  return next;
}

export function patchNode(
  id: string,
  patch: { title?: string; position?: Coords },
): Node | null {
  const node = getNode(id);
  if (!node) return null;
  const next: Node = {
    ...node,
    title: patch.title ?? node.title,
    position: patch.position ?? node.position,
    updatedAt: Date.now(),
  };
  putNode(next);
  return next;
}

// Recursion cap for the two graph walks; a burrow is never this deep.
const MAX_DEPTH = 64;

const descendants = db.prepare(
  `WITH RECURSIVE down (id, depth) AS (
     SELECT id, 0 FROM nodes WHERE id = ?
     UNION ALL
     SELECT n.id, down.depth + 1 FROM nodes n JOIN down ON n.parent_id = down.id
     WHERE down.depth < ${MAX_DEPTH}
   )
   SELECT id FROM down`,
);

// One delete stamps the whole branch with the same instant; restore keys off it.
export function deleteBranch(id: string): string[] | null {
  if (!getNode(id)) return null;
  const ids = (descendants.all(id) as { id: string }[]).map((row) => row.id);
  const at = Date.now();
  const soft = db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = ?");
  for (const nodeId of ids) soft.run(at, nodeId);
  return ids;
}

export function restoreBranch(id: string): string[] {
  const row = db.prepare("SELECT deleted_at FROM nodes WHERE id = ?").get(id) as
    | { deleted_at: number | null }
    | undefined;
  if (!row?.deleted_at) return [];
  const rows = db.prepare("SELECT id FROM nodes WHERE deleted_at = ?").all(row.deleted_at) as {
    id: string;
  }[];
  db.prepare("UPDATE nodes SET deleted_at = NULL WHERE deleted_at = ?").run(row.deleted_at);
  return rows.map((item) => item.id);
}

// Root → node, markdown only. Siblings never enter context, and a deleted node
// ends the chain.
export function lineage(nodeId: string): string {
  const rows = db
    .prepare(
      `WITH RECURSIVE up (id, parent_id, title, markdown, depth) AS (
         SELECT id, parent_id, title, markdown, 0 FROM nodes
         WHERE id = ? AND deleted_at IS NULL
         UNION ALL
         SELECT n.id, n.parent_id, n.title, n.markdown, up.depth + 1
         FROM nodes n JOIN up ON n.id = up.parent_id
         WHERE up.depth < ${MAX_DEPTH} AND n.deleted_at IS NULL
       )
       SELECT title, markdown FROM up ORDER BY depth DESC`,
    )
    .all(nodeId) as { title: string; markdown: string }[];
  return rows.map((row) => `${row.title}\n${row.markdown}`).join("\n\n");
}

function seed() {
  if (db.prepare("SELECT 1 FROM burrows LIMIT 1").get()) return;
  db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
    fixtureBurrow.userId,
    "demo@deepburrow.dev",
    fixtureBurrow.createdAt,
  );
  db.prepare(
    "INSERT INTO burrows (id, user_id, title, viewport, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    fixtureBurrow.id,
    fixtureBurrow.userId,
    fixtureBurrow.title,
    JSON.stringify(fixtureBurrow.viewport),
    fixtureBurrow.createdAt,
    fixtureBurrow.updatedAt,
  );
  for (const node of fixtureNodes) putNode(node);
}

seed();
