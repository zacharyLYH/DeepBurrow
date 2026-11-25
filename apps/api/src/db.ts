import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_VIEWPORT,
  type Burrow,
  type Coords,
  type Node,
  type NodeStatus,
  type Origin,
  type Preset,
  type PushSubscription,
  type UserSettings,
  type Viewport,
} from "../../../packages/types/src/types.ts";
import type { ProviderConfig } from "./llm.ts";
import { seal, unseal } from "./secrets.ts";

type UserRow = {
  id: string;
  email: string;
  created_at: number;
};

type BurrowRow = {
  id: string;
  user_id: string;
  title: string;
  viewport: string;
  created_at: number;
  updated_at: number;
};

type ProviderRow = {
  model_base_url: string | null;
  model_name: string | null;
  model_api_key_enc: Uint8Array | null;
  search_base_url: string | null;
  search_model: string | null;
  search_api_key_enc: Uint8Array | null;
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

// Explicit columns: row shapes above are the contract, not whatever SQLite adds.
const USER_COLUMNS = "id, email, created_at";
const BURROW_COLUMNS = "id, user_id, title, viewport, created_at, updated_at";
const NODE_COLUMNS =
  "id, burrow_id, parent_id, title, markdown, origin, sources, followups, status, error, position_x, position_y, deleted_at, created_at, updated_at";

export type User = { id: string; email: string };
export type RefreshRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
};

const dataDir = process.env.DATA_DIR ?? fileURLToPath(new URL("../../../data/", import.meta.url));
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "deepburrow.db"));
db.exec("PRAGMA foreign_keys = ON");
db.exec("PRAGMA journal_mode = WAL");

const migrations = fileURLToPath(new URL("../../../db/migrations/", import.meta.url));
for (const file of readdirSync(migrations).sort()) db.exec(readFileSync(`${migrations}${file}`, "utf8"));

const toUser = (row: UserRow): User => ({ id: row.id, email: row.email });

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

const userById = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`);
const userByEmail = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`);

export function findUserByEmail(email: string): User | null {
  const row = userByEmail.get(email) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getUser(id: string): User | null {
  const row = userById.get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function createAccount(email: string): User {
  const id = randomUUID();
  const now = Date.now();
  db.exec("BEGIN");
  try {
    db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
      id,
      email,
      now,
    );
    db.prepare(
      "INSERT INTO burrows (id, user_id, title, viewport, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(
      randomUUID(),
      id,
      "New burrow",
      JSON.stringify({ x: 0, y: 0, zoom: 1 }),
      now,
      now,
    );
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { id, email };
}

export function primaryBurrow(userId: string): Burrow | null {
  const row = db
    .prepare(`SELECT ${BURROW_COLUMNS} FROM burrows WHERE user_id = ? ORDER BY created_at, id LIMIT 1`)
    .get(userId) as BurrowRow | undefined;
  return row ? toBurrow(row) : null;
}

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

const ownsBurrow = db.prepare("SELECT 1 FROM burrows WHERE id = ? AND user_id = ?");

export function putNode(userId: string, node: Node) {
  if (!ownsBurrow.get(node.burrowId, userId)) throw new Error("node burrow not owned");
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

const nodeRow = (userId: string, id: string, includeDeleted: boolean) =>
  db
    .prepare(
      `SELECT ${NODE_COLUMNS} FROM nodes
       WHERE id = ? AND burrow_id IN (SELECT id FROM burrows WHERE user_id = ?)${includeDeleted ? "" : " AND deleted_at IS NULL"}`,
    )
    .get(id, userId) as NodeRow | undefined;

export function getNode(userId: string, id: string): Node | null {
  const row = nodeRow(userId, id, false);
  return row ? toNode(row) : null;
}

const burrowRow = (userId: string, id: string) =>
  db.prepare(`SELECT ${BURROW_COLUMNS} FROM burrows WHERE id = ? AND user_id = ?`).get(id, userId) as
    | BurrowRow
    | undefined;

export function getBurrow(userId: string, id: string): { burrow: Burrow; nodes: Node[] } | null {
  const row = burrowRow(userId, id);
  if (!row) return null;
  const burrow = toBurrow(row);
  const nodes = db
    .prepare(
      `SELECT ${NODE_COLUMNS} FROM nodes WHERE burrow_id = ? AND deleted_at IS NULL ORDER BY created_at, id`,
    )
    .all(burrow.id) as NodeRow[];
  return { burrow, nodes: nodes.map(toNode) };
}

export function listBurrows(userId: string): Burrow[] {
  const rows = db
    .prepare(`SELECT ${BURROW_COLUMNS} FROM burrows WHERE user_id = ? ORDER BY created_at, id`)
    .all(userId) as BurrowRow[];
  return rows.map(toBurrow);
}

// Case-insensitive per owner; another user may reuse the title.
export function createBurrow(userId: string, title: string): Burrow {
  const id = randomUUID();
  const now = Date.now();
  db.prepare(
    "INSERT INTO burrows (id, user_id, title, viewport, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(id, userId, title, JSON.stringify(DEFAULT_VIEWPORT), now, now);
  return toBurrow(burrowRow(userId, id)!);
}

export function patchBurrow(
  userId: string,
  id: string,
  patch: { title?: string; viewport?: Viewport },
): Burrow | null {
  const row = burrowRow(userId, id);
  if (!row) return null;
  const title = patch.title ?? row.title;
  const viewport = patch.viewport ? JSON.stringify(patch.viewport) : row.viewport;
  const updatedAt = Date.now();
  db.prepare(
    "UPDATE burrows SET title = ?, viewport = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  ).run(title, viewport, updatedAt, id, userId);
  return toBurrow({ ...row, title, viewport, updated_at: updatedAt });
}

type SettingsRow = {
  theme: string;
  reading_size: number;
  presets_linked: number;
  selection_presets: string | null;
  followup_presets: string | null;
};

const parsePresets = (raw: string | null | undefined): Preset[] | undefined => {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as Preset[]) : undefined;
  } catch {
    return undefined;
  }
};

export function readSettings(userId: string): UserSettings {
  const row = db
    .prepare(
      "SELECT theme, reading_size, presets_linked, selection_presets, followup_presets FROM users WHERE id = ?",
    )
    .get(userId) as SettingsRow | undefined;
  const selection = parsePresets(row?.selection_presets);
  const followUp = parsePresets(row?.followup_presets);
  return {
    theme: row?.theme === "dark" ? "dark" : "light",
    readingSize: row?.reading_size ?? 1,
    presets: {
      ...(selection ? { selection } : {}),
      ...(followUp ? { followUp } : {}),
      link: Boolean(row?.presets_linked),
    },
  };
}

export function writeSettings(userId: string, patch: Partial<UserSettings>): UserSettings {
  const presets = patch.presets;
  db.prepare(
    `UPDATE users SET
       theme = COALESCE(?, theme),
       reading_size = COALESCE(?, reading_size),
       presets_linked = COALESCE(?, presets_linked),
       selection_presets = COALESCE(?, selection_presets),
       followup_presets = COALESCE(?, followup_presets)
     WHERE id = ?`,
  ).run(
    patch.theme === "dark" || patch.theme === "light" ? patch.theme : null,
    typeof patch.readingSize === "number" && Number.isFinite(patch.readingSize)
      ? patch.readingSize
      : null,
    presets?.link === undefined ? null : presets.link ? 1 : 0,
    presets?.selection ? JSON.stringify(presets.selection) : null,
    presets?.followUp ? JSON.stringify(presets.followUp) : null,
    userId,
  );
  return readSettings(userId);
}

const providerRow = db.prepare(
  "SELECT model_base_url, model_name, model_api_key_enc, search_base_url, search_model, search_api_key_enc FROM users WHERE id = ?",
);

// Keys rest encrypted; a key that will not unseal counts as unconfigured.
const configFrom = (
  baseUrl: string | null | undefined,
  model: string | null | undefined,
  sealed: string | undefined,
): ProviderConfig | null => {
  if (!baseUrl || !model || !sealed) return null;
  try {
    return { baseUrl, model, apiKey: unseal(sealed) };
  } catch {
    return null;
  }
};

export function readModelConfig(userId: string): ProviderConfig | null {
  const row = providerRow.get(userId) as ProviderRow | undefined;
  return configFrom(
    row?.model_base_url,
    row?.model_name,
    row?.model_api_key_enc ? Buffer.from(row.model_api_key_enc).toString() : undefined,
  );
}

export function writeModelConfig(userId: string, config: ProviderConfig) {
  db.prepare("UPDATE users SET model_base_url = ?, model_name = ?, model_api_key_enc = ? WHERE id = ?").run(
    config.baseUrl,
    config.model,
    Buffer.from(seal(config.apiKey)),
    userId,
  );
}

export function readSearchConfig(userId: string): ProviderConfig | null {
  const row = providerRow.get(userId) as ProviderRow | undefined;
  return configFrom(
    row?.search_base_url,
    row?.search_model,
    row?.search_api_key_enc ? Buffer.from(row.search_api_key_enc).toString() : undefined,
  );
}

export function writeSearchConfig(userId: string, config: ProviderConfig) {
  db.prepare("UPDATE users SET search_base_url = ?, search_model = ?, search_api_key_enc = ? WHERE id = ?").run(
    config.baseUrl,
    config.model,
    Buffer.from(seal(config.apiKey)),
    userId,
  );
}

export function patchNode(
  userId: string,
  id: string,
  patch: { title?: string; position?: Coords },
): Node | null {
  const node = getNode(userId, id);
  if (!node) return null;
  const next: Node = {
    ...node,
    title: patch.title ?? node.title,
    position: patch.position ?? node.position,
    updatedAt: Date.now(),
  };
  putNode(userId, next);
  return next;
}

// Recursion cap for the two graph walks; a burrow is never this deep.
const MAX_DEPTH = 64;

const descendants = db.prepare(
  `WITH RECURSIVE down (id, depth) AS (
     SELECT id, 0 FROM nodes WHERE id = ? AND burrow_id = ?
     UNION ALL
     SELECT n.id, down.depth + 1 FROM nodes n JOIN down ON n.parent_id = down.id
     WHERE down.depth < ${MAX_DEPTH} AND n.burrow_id = ?
   )
   SELECT id FROM down`,
);

// One delete stamps the whole branch with the same instant; restore keys off it.
export function deleteBranch(userId: string, id: string): string[] | null {
  const node = getNode(userId, id);
  if (!node) return null;
  const ids = (
    descendants.all(id, node.burrowId, node.burrowId) as { id: string }[]
  ).map((row) => row.id);
  const at = Date.now();
  const soft = db.prepare("UPDATE nodes SET deleted_at = ? WHERE id = ? AND burrow_id = ?");
  for (const nodeId of ids) soft.run(at, nodeId, node.burrowId);
  return ids;
}

export function restoreBranch(userId: string, id: string): string[] {
  const node = nodeRow(userId, id, true);
  if (!node?.deleted_at) return [];
  const rows = db
    .prepare("SELECT id FROM nodes WHERE deleted_at = ? AND burrow_id = ?")
    .all(node.deleted_at, node.burrow_id) as { id: string }[];
  db.prepare("UPDATE nodes SET deleted_at = NULL WHERE deleted_at = ? AND burrow_id = ?").run(
    node.deleted_at,
    node.burrow_id,
  );
  return rows.map((item) => item.id);
}

// Root → node, markdown only. Siblings never enter context, and a deleted node
// ends the chain.
export function lineage(userId: string, nodeId: string): string {
  const node = getNode(userId, nodeId);
  if (!node) return "";
  const rows = db
    .prepare(
      `WITH RECURSIVE up (id, parent_id, title, markdown, depth) AS (
         SELECT id, parent_id, title, markdown, 0 FROM nodes
         WHERE id = ? AND burrow_id = ? AND deleted_at IS NULL
         UNION ALL
         SELECT n.id, n.parent_id, n.title, n.markdown, up.depth + 1
         FROM nodes n JOIN up ON n.id = up.parent_id
         WHERE up.depth < ${MAX_DEPTH} AND n.deleted_at IS NULL AND n.burrow_id = ?
       )
       SELECT title, markdown FROM up ORDER BY depth DESC`,
    )
    .all(nodeId, node.burrowId, node.burrowId) as { title: string; markdown: string }[];
  return rows.map((row) => `${row.title}\n${row.markdown}`).join("\n\n");
}

export function createRefreshToken(
  id: string,
  userId: string,
  tokenHash: string,
  expiresAt: number,
) {
  db.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, userId, tokenHash, Date.now(), expiresAt);
}

export function findRefreshToken(id: string): RefreshRecord | null {
  const row = db
    .prepare(
      `SELECT id, user_id AS userId, token_hash AS tokenHash, expires_at AS expiresAt
       FROM refresh_tokens WHERE id = ?`,
    )
    .get(id) as RefreshRecord | undefined;
  return row ?? null;
}

export function rotateRefreshToken(id: string, oldHash: string, newHash: string) {
  const result = db
    .prepare(
      "UPDATE refresh_tokens SET token_hash = ? WHERE id = ? AND token_hash = ? AND expires_at > ?",
    )
    .run(newHash, id, oldHash, Date.now());
  return result.changes === 1;
}

export function revokeRefreshToken(id: string) {
  db.prepare("DELETE FROM refresh_tokens WHERE id = ?").run(id);
}

export function savePushSubscription(userId: string, subscription: PushSubscription) {
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
       created_at = excluded.created_at`,
  ).run(subscription.endpoint, userId, subscription.p256dh, subscription.auth, Date.now());
}

export function deletePushSubscription(endpoint: string) {
  db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
}

export function hasPushSubscription(userId: string, endpoint: string) {
  return Boolean(
    db.prepare("SELECT 1 FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").get(endpoint, userId),
  );
}

export function listPushSubscriptions(userId: string): PushSubscription[] {
  return db
    .prepare("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?")
    .all(userId) as PushSubscription[];
}
