import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import type { PushSubscription } from "../../../../packages/types/src/types.ts";
import type { AuthEnv } from "../auth.ts";
import {
  deletePushSubscription,
  hasPushSubscription,
  savePushSubscription,
} from "../db.ts";
import { sendPush } from "../push.ts";

export const pushRoutes = new Hono<AuthEnv>();

const subscriptionFrom = (value: unknown): PushSubscription | null => {
  const input = (value ?? {}) as Record<string, unknown>;
  const text = (field: unknown) => (typeof field === "string" ? field.trim() : "");
  const endpoint = text(input.endpoint);
  const p256dh = text(input.p256dh);
  const auth = text(input.auth);
  if (!endpoint || !p256dh || !auth) return null;
  try {
    return new URL(endpoint).protocol === "https:" ? { endpoint, p256dh, auth } : null;
  } catch {
    return null;
  }
};

pushRoutes.get("/key", (c) => c.json({ key: process.env.VAPID_PUBLIC_KEY ?? "" }));

pushRoutes.get("/status", (c) =>
  c.json({ subscribed: hasPushSubscription(c.get("userId"), c.req.query("endpoint") ?? "") }),
);

pushRoutes.post("/subscription", async (c) => {
  const subscription = subscriptionFrom(await c.req.json().catch(() => null));
  if (!subscription) return c.json({ error: "Invalid subscription" }, 400);
  savePushSubscription(c.get("userId"), subscription);
  return c.json({ ok: true }, 201);
});

pushRoutes.delete("/subscription", async (c) => {
  const body = await c.req.json<{ endpoint?: unknown }>().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (endpoint) deletePushSubscription(endpoint);
  return c.body(null, 204);
});

pushRoutes.post("/test", async (c) => {
  const body = await c.req.json<{ endpoint?: unknown; testId?: unknown }>().catch(() => null);
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  if (!hasPushSubscription(c.get("userId"), endpoint)) {
    return c.json({ error: "This device is not subscribed" }, 404);
  }
  const testId = typeof body?.testId === "string" ? body.testId : randomUUID();
  await sendPush(
    c.get("userId"),
    { title: "DeepBurrow", body: "Notifications are working.", testId },
    endpoint,
  );
  return c.json({ testId }, 202);
});
