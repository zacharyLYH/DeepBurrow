import { Hono } from "hono";
import type { AuthEnv } from "../auth.ts";
import { deleteBranch, getNode, patchNode, restoreBranch } from "../db.ts";
import { cancelRun } from "../runs.ts";
import { streamNode } from "../stream.ts";
import { isCoords } from "../validation.ts";

type NodePatch = { title?: unknown; position?: unknown };

const MAX_TITLE = 80;

export const nodeRoutes = new Hono<AuthEnv>();

nodeRoutes.patch("/:id", async (c) => {
  const body = await c.req.json<NodePatch>().catch(() => ({}) as NodePatch);
  const patch: { title?: string; position?: { x: number; y: number } } = {};

  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return c.json({ error: "title required" }, 400);
    if (title.length > MAX_TITLE) return c.json({ error: "title too long" }, 400);
    patch.title = title;
  }
  if (body.position !== undefined) {
    if (!isCoords(body.position)) return c.json({ error: "bad position" }, 400);
    patch.position = { x: body.position.x, y: body.position.y };
  }
  if (!patch.title && !patch.position) return c.json({ error: "nothing to patch" }, 400);

  const node = patchNode(c.get("userId"), c.req.param("id"), patch);
  return node ? c.json({ node }) : c.json({ error: "node not found" }, 404);
});

nodeRoutes.delete("/:id", (c) => {
  const userId = c.get("userId");
  const ids = deleteBranch(userId, c.req.param("id"));
  if (!ids) return c.json({ error: "node not found" }, 404);
  for (const id of ids) cancelRun(userId, id);
  return c.json({ ids });
});

nodeRoutes.post("/:id/restore", (c) => {
  const ids = restoreBranch(c.get("userId"), c.req.param("id"));
  return ids.length ? c.json({ ids }) : c.json({ error: "not deleted" }, 404);
});

nodeRoutes.get("/:id/stream", streamNode);

nodeRoutes.post("/:id/cancel", (c) => {
  const userId = c.get("userId");
  if (!getNode(userId, c.req.param("id"))) return c.json({ error: "node not found" }, 404);
  cancelRun(userId, c.req.param("id"));
  return c.json({ ok: true });
});
