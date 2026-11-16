import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { fixtureBurrow, fixtureNodes } from "../../../packages/types/src/fixtures.ts";
import type { Burrow, Node, NodeStatus, Origin } from "../../../packages/types/src/types.ts";

// "demo" is the only burrow until auth lands in M7.
export const DEMO_BURROW = "demo";

type BurrowRow = {
  id: string;
  user_id: string;
  title: string;
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
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const upsertNode = db.prepare(
  `INSERT INTO nodes (id, burrow_id, parent_id, title, markdown, origin, sources, followups, status, error, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     parent_id = excluded.parent_id, title = excluded.title, markdown = excluded.markdown,
     origin = excluded.origin, sources = excluded.sources, followups = excluded.followups,
     status = excluded.status, error = excluded.error, updated_at = excluded.updated_at`,
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
    node.createdAt,
    node.updatedAt,
  );
}

export function getNode(id: string): Node | null {
  const row = db.prepare("SELECT * FROM nodes WHERE id = ?").get(id) as NodeRow | undefined;
  return row ? toNode(row) : null;
}

export function getBurrow(id: string): { burrow: Burrow; nodes: Node[] } | null {
  const row = (
    id === DEMO_BURROW
      ? db.prepare("SELECT * FROM burrows ORDER BY created_at LIMIT 1").get()
      : db.prepare("SELECT * FROM burrows WHERE id = ?").get(id)
  ) as BurrowRow | undefined;
  if (!row) return null;
  const burrow = toBurrow(row);
  const nodes = db
    .prepare("SELECT * FROM nodes WHERE burrow_id = ? ORDER BY created_at, id")
    .all(burrow.id) as NodeRow[];
  return { burrow, nodes: nodes.map(toNode) };
}

// Root → node, markdown only. Siblings never enter context.
export function lineage(nodeId: string): string {
  const rows = db
    .prepare(
      `WITH RECURSIVE up (id, parent_id, title, markdown, depth) AS (
         SELECT id, parent_id, title, markdown, 0 FROM nodes WHERE id = ?
         UNION ALL
         SELECT n.id, n.parent_id, n.title, n.markdown, up.depth + 1
         FROM nodes n JOIN up ON n.id = up.parent_id
         WHERE up.depth < 64
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
    "INSERT INTO burrows (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    fixtureBurrow.id,
    fixtureBurrow.userId,
    fixtureBurrow.title,
    fixtureBurrow.createdAt,
    fixtureBurrow.updatedAt,
  );
  for (const node of fixtureNodes) putNode(node);
}

seed();
