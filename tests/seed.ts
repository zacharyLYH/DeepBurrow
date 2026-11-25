import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { seal } from "../apps/api/src/secrets.ts";
import { demoCredentials, fixtureBurrow, fixtureBurrows, fixtureNodes } from "../packages/types/src/fixtures.ts";
import { MOCK_API_KEY, MOCK_PROVIDER_URL } from "./mock-provider.ts";

const migrations = fileURLToPath(new URL("../db/migrations/", import.meta.url));
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
      `INSERT INTO users (id, email, created_at, model_base_url, model_name, model_api_key_enc)
       VALUES (?, ?, ?, ?, 'mock/chat', ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email, model_base_url = excluded.model_base_url,
         model_name = excluded.model_name, model_api_key_enc = excluded.model_api_key_enc,
         search_base_url = NULL, search_model = NULL, search_api_key_enc = NULL,
         theme = 'light', reading_size = 1, presets_linked = 0,
         selection_presets = NULL, followup_presets = NULL`,
    ).run(fixtureBurrow.userId, demoCredentials.email, fixtureBurrow.createdAt, MOCK_PROVIDER_URL, mockKey);
    // Fixtures are the only burrows: stale rows and their nodes cascade away.
    db.prepare("DELETE FROM burrows WHERE user_id = ?").run(fixtureBurrow.userId);
    const insertBurrow = db.prepare(
      `INSERT INTO burrows (id, user_id, title, viewport, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const burrow of fixtureBurrows) {
      insertBurrow.run(
        burrow.id,
        burrow.userId,
        burrow.title,
        JSON.stringify(burrow.viewport),
        burrow.createdAt,
        burrow.updatedAt,
      );
    }
    db.prepare("DELETE FROM refresh_tokens WHERE user_id = ?").run(fixtureBurrow.userId);

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
