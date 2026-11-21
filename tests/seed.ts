import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { hashPassword } from "../apps/api/src/security.ts";
import { seal } from "../apps/api/src/secrets.ts";
import { demoCredentials, fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";
import { MOCK_API_KEY, MOCK_PROVIDER_URL } from "./mock-provider.ts";

const migrations = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const demoHash = hashPassword(demoCredentials.password);
// Every browser-facing spec runs against the HTTP mock, never a fake in the API.
const mockKey = Buffer.from(seal(MOCK_API_KEY));

export function seedDemo(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, "deepburrow.db"));
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync(migrations).sort()) {
    db.exec(readFileSync(join(migrations, file), "utf8"));
  }

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO users (id, email, password_hash, created_at, settings, base_url, model, api_key_enc, verified_at)
       VALUES (?, ?, ?, ?, '{}', ?, 'mock/chat', ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email, password_hash = excluded.password_hash, settings = '{}',
         base_url = excluded.base_url, model = excluded.model,
         api_key_enc = excluded.api_key_enc, verified_at = excluded.verified_at, search = '{}'`,
    ).run(
      fixtureBurrow.userId,
      demoCredentials.email,
      demoHash,
      fixtureBurrow.createdAt,
      MOCK_PROVIDER_URL,
      mockKey,
      Date.now(),
    );
    db.prepare(
      `INSERT INTO burrows (id, user_id, title, viewport, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id, title = excluded.title,
         viewport = excluded.viewport, updated_at = excluded.updated_at`,
    ).run(
      fixtureBurrow.id,
      fixtureBurrow.userId,
      fixtureBurrow.title,
      JSON.stringify(fixtureBurrow.viewport),
      fixtureBurrow.createdAt,
      fixtureBurrow.updatedAt,
    );
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").run(fixtureBurrow.userId);
    db.prepare("DELETE FROM nodes WHERE burrow_id = ?").run(fixtureBurrow.id);

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
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.close();
  }
}
