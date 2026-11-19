import { Hono } from "hono";
import type { AuthEnv } from "../auth.ts";
import { readSettings, writeSettings } from "../db.ts";

export const settingsRoutes = new Hono<AuthEnv>();

settingsRoutes.get("/", (c) => c.json({ settings: readSettings(c.get("userId")) }));

settingsRoutes.patch("/", async (c) => {
  const patch = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!patch) return c.json({ error: "settings required" }, 400);
  return c.json({ settings: writeSettings(c.get("userId"), patch) });
});
