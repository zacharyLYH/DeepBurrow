import { Hono } from "hono";
import type { AuthEnv } from "../auth.ts";
import { getBurrow, writeViewport } from "../db.ts";
import { isViewport } from "../validation.ts";

export const burrowRoutes = new Hono<AuthEnv>();

burrowRoutes.get("/:id", (c) => {
  const burrow = getBurrow(c.get("userId"), c.req.param("id"));
  return burrow ? c.json(burrow) : c.json({ error: "not found" }, 404);
});

burrowRoutes.patch("/:id", async (c) => {
  const body = await c.req
    .json<{ viewport?: unknown }>()
    .catch(() => ({}) as { viewport?: unknown });
  if (!isViewport(body.viewport)) return c.json({ error: "bad viewport" }, 400);
  const burrow = writeViewport(c.get("userId"), c.req.param("id"), body.viewport);
  return burrow ? c.json({ burrow }) : c.json({ error: "burrow not found" }, 404);
});
