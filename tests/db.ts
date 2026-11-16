import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fixtureNodes } from "../packages/types/src/fixtures.ts";

// Keep in sync with the webServer DATA_DIR in playwright.config.ts. Workspace
// scripts run from apps/api, so DATA_DIR resolves under that package.
const DB_PATH = join(process.cwd(), "apps/api/data/test/deepburrow.db");

// Drops everything asks added, leaving the seeded fixture tree. Foreign keys stay
// on so children of a deleted card go with it.
export function resetDemoBurrow() {
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON");
  const ids = fixtureNodes.map((node) => node.id);
  db.prepare(`DELETE FROM nodes WHERE id NOT IN (${ids.map(() => "?").join(", ")})`).run(...ids);
  db.close();
}
