import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import type { Event, Node } from "../../../packages/types/src/types.ts";
import type { AuthContext } from "./auth.ts";
import { getNode, putNode } from "./db.ts";
import { getRun, subscribe, type Run } from "./runs.ts";

const settled = (node: Node): Event => ({
  nodeId: node.id,
  type: node.status === "answered" ? "node.done" : "node.error",
  node,
});

function attach(stream: SSEStreamingApi, run: Run) {
  const unsubscribe = subscribe(run, async (event) => {
    await stream.writeSSE({ data: JSON.stringify(event) });
  });
  stream.onAbort(unsubscribe);
}

export const relay = (c: AuthContext, userId: string, run: Run, nodeId: string) =>
  streamSSE(c, async (stream) => {
    attach(stream, run);
    await run.done;
    const node = getNode(userId, nodeId);
    if (node) await stream.writeSSE({ data: JSON.stringify(settled(node)) });
  });

export const streamNode = (c: AuthContext) => {
  const userId = c.get("userId");
  const nodeId = c.req.param("id") ?? "";
  const run = getRun(userId, nodeId);

  if (run) return relay(c, userId, run, nodeId);

  const stored = getNode(userId, nodeId);
  if (!stored) return c.json({ error: "node not found" }, 404);

  // No run means it died with an earlier process; settle the leftover row.
  const node =
    stored.status === "pending"
      ? { ...stored, status: "stopped" as const, updatedAt: Date.now() }
      : stored;
  if (node !== stored) putNode(userId, node);

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({ data: JSON.stringify(settled(node)) });
  });
};
