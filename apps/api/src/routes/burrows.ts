import { Hono } from "hono";
import { TITLE_MAX } from "../../../../packages/types/src/types.ts";
import type { AuthEnv } from "../auth.ts";
import { createBurrow, getBurrow, listBurrows, patchBurrow } from "../db.ts";
import { isViewport } from "../validation.ts";

export const burrowRoutes = new Hono<AuthEnv>();

const DUPLICATE = "A burrow with that title already exists";

// Trimmed, 1–80 characters. An empty result means the field is unusable.
const titleFrom = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const validTitle = (title: string) => title.length >= 1 && title.length <= TITLE_MAX;

// The unique index is the one authority for title collisions.
const guard = <T>(run: () => T): { value: T } | { duplicate: true } => {
  try {
    return { value: run() };
  } catch (cause) {
    if (cause instanceof Error && cause.message.includes("burrows_unique_title")) {
      return { duplicate: true };
    }
    throw cause;
  }
};

type BurrowBody = { title?: unknown; viewport?: unknown };

burrowRoutes.get("/", (c) => c.json({ burrows: listBurrows(c.get("userId")) }));

burrowRoutes.post("/", async (c) => {
  const body = await c.req.json<BurrowBody>().catch(() => ({}) as BurrowBody);
  const title = titleFrom(body.title);
  if (!validTitle(title)) return c.json({ error: "Title must be 1–80 characters" }, 400);
  const result = guard(() => createBurrow(c.get("userId"), title));
  if ("duplicate" in result) return c.json({ error: DUPLICATE }, 409);
  return c.json({ burrow: result.value }, 201);
});

burrowRoutes.get("/:id", (c) => {
  const burrow = getBurrow(c.get("userId"), c.req.param("id"));
  return burrow ? c.json(burrow) : c.json({ error: "not found" }, 404);
});

burrowRoutes.patch("/:id", async (c) => {
  const body = await c.req.json<BurrowBody>().catch(() => ({}) as BurrowBody);
  const patch: Parameters<typeof patchBurrow>[2] = {};

  if (body.title !== undefined) {
    const title = titleFrom(body.title);
    if (!validTitle(title)) return c.json({ error: "Title must be 1–80 characters" }, 400);
    patch.title = title;
  }
  if (body.viewport !== undefined) {
    if (!isViewport(body.viewport)) return c.json({ error: "bad viewport" }, 400);
    patch.viewport = body.viewport;
  }
  if (!patch.title && !patch.viewport) return c.json({ error: "nothing to patch" }, 400);

  const result = guard(() => patchBurrow(c.get("userId"), c.req.param("id"), patch));
  if ("duplicate" in result) return c.json({ error: DUPLICATE }, 409);
  return result.value
    ? c.json({ burrow: result.value })
    : c.json({ error: "burrow not found" }, 404);
});
