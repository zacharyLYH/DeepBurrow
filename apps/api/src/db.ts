import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type {
  Burrow,
  Coords,
  Node,
  NodeStatus,
  Origin,
  Viewport,
} from "../../../packages/types/src/types.ts";
import type { ProviderConfig } from "./llm.ts";
import { seal, unseal } from "./secrets.ts";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  settings: string;
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
  base_url: string | null;
  model: string | null;
  api_key_enc: Uint8Array | null;
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

export type User = { id: string; email: string };
export type AuthUser = User & { passwordHash: string };
export type RefreshRecord = {
  tokenId: string;
  sessionId: string;
  userId: string;
  tokenHash: string;
  tokenExpiresAt: number;
  usedAt: number | null;
  sessionExpiresAt: number;
  sessionRevokedAt: number | null;
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

const authUser = (row: UserRow | undefined): AuthUser | null =>
  row ? { ...toUser(row), passwordHash: row.password_hash } : null;
const userById = db.prepare("SELECT * FROM users WHERE id = ?");
const userByEmail = db.prepare("SELECT * FROM users WHERE email = ?");

export function findUserByEmail(email: string): AuthUser | null {
  return authUser(userByEmail.get(email) as UserRow | undefined);
}

export function getUser(id: string): User | null {
  const row = userById.get(id) as UserRow | undefined;
  return row ? toUser(row) : null;
}

export function getAuthUser(id: string): AuthUser | null {
  return authUser(userById.get(id) as UserRow | undefined);
}

export function setPassword(userId: string, passwordHash: string) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export function createAccount(email: string, passwordHash: string): User {
  const id = randomUUID();
  const now = Date.now();
  db.exec("BEGIN");
  try {
    db.prepare(
      "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    ).run(id, email, passwordHash, now);
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
    .prepare("SELECT * FROM burrows WHERE user_id = ? ORDER BY created_at, id LIMIT 1")
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
      `SELECT n.* FROM nodes n JOIN burrows b ON b.id = n.burrow_id
       WHERE n.id = ? AND b.user_id = ?${includeDeleted ? "" : " AND n.deleted_at IS NULL"}`,
    )
    .get(id, userId) as NodeRow | undefined;

export function getNode(userId: string, id: string): Node | null {
  const row = nodeRow(userId, id, false);
  return row ? toNode(row) : null;
}

const burrowRow = (userId: string, id: string) =>
  db.prepare("SELECT * FROM burrows WHERE id = ? AND user_id = ?").get(id, userId) as
    | BurrowRow
    | undefined;

export function getBurrow(userId: string, id: string): { burrow: Burrow; nodes: Node[] } | null {
  const row = burrowRow(userId, id);
  if (!row) return null;
  const burrow = toBurrow(row);
  const nodes = db
    .prepare("SELECT * FROM nodes WHERE burrow_id = ? AND deleted_at IS NULL ORDER BY created_at, id")
    .all(burrow.id) as NodeRow[];
  return { burrow, nodes: nodes.map(toNode) };
}

export function writeViewport(userId: string, id: string, viewport: Viewport): Burrow | null {
  const row = burrowRow(userId, id);
  if (!row) return null;
  const json = JSON.stringify(viewport);
  db.prepare("UPDATE burrows SET viewport = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
    json,
    Date.now(),
    row.id,
    userId,
  );
  return toBurrow({ ...row, viewport: json });
}

export function readSettings(userId: string): Record<string, unknown> {
  const row = db.prepare("SELECT settings FROM users WHERE id = ?").get(userId) as
    | { settings: string }
    | undefined;
  try {
    return JSON.parse(row?.settings ?? "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function writeSettings(
  userId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...readSettings(userId), ...patch };
  db.prepare("UPDATE users SET settings = ? WHERE id = ?").run(JSON.stringify(next), userId);
  return next;
}

const providerRow = db.prepare("SELECT base_url, model, api_key_enc FROM users WHERE id = ?");
const searchRow = db.prepare("SELECT search FROM users WHERE id = ?");

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
    row?.base_url,
    row?.model,
    row?.api_key_enc ? Buffer.from(row.api_key_enc).toString() : undefined,
  );
}

export function writeModelConfig(userId: string, config: ProviderConfig) {
  db.prepare(
    "UPDATE users SET base_url = ?, model = ?, api_key_enc = ?, verified_at = ? WHERE id = ?",
  ).run(config.baseUrl, config.model, Buffer.from(seal(config.apiKey)), Date.now(), userId);
}

export function readSearchConfig(userId: string): ProviderConfig | null {
  const row = searchRow.get(userId) as { search: string } | undefined;
  try {
    const stored = JSON.parse(row?.search ?? "{}") as {
      baseUrl?: string;
      model?: string;
      key?: string;
    };
    return configFrom(stored.baseUrl, stored.model, stored.key);
  } catch {
    return null;
  }
}

export function writeSearchConfig(userId: string, config: ProviderConfig) {
  const search = JSON.stringify({
    baseUrl: config.baseUrl,
    model: config.model,
    key: seal(config.apiKey),
  });
  db.prepare("UPDATE users SET search = ? WHERE id = ?").run(search, userId);
}

// Login only checks presence; configured endpoints are never health-checked.
export const configuredEndpoints = (userId: string) => ({
  model: readModelConfig(userId) !== null,
  search: readSearchConfig(userId) !== null,
});

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

export function createSession(userId: string, expiresAt: number) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO auth_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).run(id, userId, Date.now(), expiresAt);
  return id;
}

export function refreshRecord(sessionId: string, tokenId: string): RefreshRecord | null {
  const row = db
    .prepare(
      `SELECT t.id AS token_id, t.session_id, t.token_hash, t.expires_at AS token_expires_at,
              t.used_at, s.user_id, s.expires_at AS session_expires_at, s.revoked_at
       FROM refresh_tokens t
       JOIN auth_sessions s ON s.id = t.session_id
       WHERE t.id = ? AND t.session_id = ?`,
    )
    .get(tokenId, sessionId) as
    | {
        token_id: string;
        session_id: string;
        token_hash: string;
        token_expires_at: number;
        used_at: number | null;
        user_id: string;
        session_expires_at: number;
        revoked_at: number | null;
      }
    | undefined;
  if (!row) return null;
  return {
    tokenId: row.token_id,
    sessionId: row.session_id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    tokenExpiresAt: row.token_expires_at,
    usedAt: row.used_at,
    sessionExpiresAt: row.session_expires_at,
    sessionRevokedAt: row.revoked_at,
  };
}

export function consumeRefreshToken(sessionId: string, tokenId: string) {
  const result = db
    .prepare(
      "UPDATE refresh_tokens SET used_at = ? WHERE id = ? AND session_id = ? AND used_at IS NULL",
    )
    .run(Date.now(), tokenId, sessionId);
  return result.changes === 1;
}

export function appendRefreshToken(
  sessionId: string,
  tokenId: string,
  tokenHash: string,
  expiresAt: number,
) {
  db.prepare(
    "INSERT INTO refresh_tokens (id, session_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(tokenId, sessionId, tokenHash, Date.now(), expiresAt);
}

export function revokeSession(sessionId: string) {
  db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL").run(
    Date.now(),
    sessionId,
  );
}

export function revokeAllSessions(userId: string) {
  db.prepare(
    "UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
  ).run(Date.now(), userId);
}

