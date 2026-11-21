import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { buildAsk, titleFromOrigin } from "../../../../packages/types/src/header.ts";
import { NODE_STEP } from "../../../../packages/types/src/layout.ts";
import type { Coords, Node, Origin } from "../../../../packages/types/src/types.ts";
import type { AuthEnv } from "../auth.ts";
import { getBurrow, getNode, primaryBurrow, putNode } from "../db.ts";
import { startRun } from "../runs.ts";
import { relay } from "../stream.ts";

type AskBody = {
  nodeId?: string;
  parentId?: string | null;
  origin?: Origin;
};

// New cards append after the rightmost card on the parent's row, never on top
// of a sibling; the client centers the result.
const nextPosition = (nodes: Node[], parent: Node | null): Coords => {
  const y = parent?.position.y ?? 0;
  const right = nodes.reduce(
    (at, node) => (Math.abs(node.position.y - y) < 1 ? Math.max(at, node.position.x) : at),
    parent?.position.x ?? 0,
  );
  return { x: right + NODE_STEP, y };
};

export async function ask(c: Context<AuthEnv>) {
  const userId = c.get("userId");
  const body = await c.req.json<AskBody>().catch(() => ({}) as AskBody);
  const existing = body.nodeId ? getNode(userId, body.nodeId) : null;
  if (body.nodeId && !existing) return c.json({ error: "node not found" }, 404);

  // Retry reuses the stored parent; only a new ask picks one.
  const parentId = existing ? existing.parentId : (body.parentId ?? null);
  const parent = parentId ? getNode(userId, parentId) : null;
  if (parentId && !parent) return c.json({ error: "parent not found" }, 404);

  const burrowId = existing?.burrowId ?? parent?.burrowId ?? primaryBurrow(userId)?.id;
  if (!burrowId) return c.json({ error: "burrow not found" }, 404);

  // A new ask supplies the origin; a retry keeps the one already on the row.
  const origin = existing?.origin ?? body.origin;
  if (!origin) return c.json({ error: "origin required" }, 400);
  const prompt = buildAsk(origin);
  if (!prompt.trim()) return c.json({ error: "ask required" }, 400);

  const node: Node = {
    id: existing?.id ?? randomUUID(),
    burrowId,
    parentId,
    title: titleFromOrigin(origin),
    markdown: "",
    origin,
    sources: [],
    followups: [],
    status: "pending",
    error: "",
    position: existing?.position ?? nextPosition(getBurrow(userId, burrowId)?.nodes ?? [], parent),
    createdAt: existing?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };
  putNode(userId, node);

  return relay(c, userId, startRun(userId, node, prompt), node.id);
}
