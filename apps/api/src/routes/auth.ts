import { Hono } from "hono";
import {
  clearAuthCookies,
  issueRefresh,
  issueSession,
  penalize,
  readRefreshSession,
  rejectAuth,
  sessionPayload,
  throttled,
  type AuthEnv,
} from "../auth.ts";
import {
  createAccount,
  findRefreshToken,
  findUserByEmail,
  revokeRefreshToken,
} from "../db.ts";
import { consumeCode, discardCode, issueCode } from "../login-codes.ts";
import { sendLoginCode } from "../mailer.ts";
import { digestMatches } from "../security.ts";

export const authRoutes = new Hono<AuthEnv>();

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const validEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Login and account creation share one flow. Whether the account exists stays
// hidden: both paths answer the same and only account creation happens later.
authRoutes.post("/email", async (c) => {
  const body = await c.req.json<{ email?: unknown }>().catch(() => null);
  const email = normalizeEmail(body?.email);
  if (!validEmail(email)) return c.json({ error: "Enter a valid email address" }, 400);

  const code = issueCode(email);
  if (code) {
    try {
      await sendLoginCode(email, code);
    } catch {
      discardCode(email);
      return c.json({ error: "Could not send the code" }, 503);
    }
  }
  return c.json({ ok: true }, 202);
});

authRoutes.post("/verify", async (c) => {
  if (throttled(c, "verify")) return c.json({ error: "Too many attempts" }, 429);
  const body = await c.req.json<{ email?: unknown; code?: unknown }>().catch(() => null);
  const email = normalizeEmail(body?.email);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  if (!validEmail(email) || !/^\d{6}$/.test(code) || !consumeCode(email, code)) {
    penalize(c, "verify");
    return c.json({ error: "Invalid or expired code" }, 401);
  }
  const user = findUserByEmail(email) ?? createAccount(email);
  issueSession(c, user.id);
  return c.json(sessionPayload(user.id));
});

authRoutes.post("/refresh", (c) => {
  const session = readRefreshSession(c);
  if (!session) return rejectAuth(c);

  const record = findRefreshToken(session.id);
  if (!record) return rejectAuth(c);

  if (
    record.expiresAt <= Date.now() ||
    !digestMatches(session.secret, record.tokenHash) ||
    !issueRefresh(c, record)
  ) {
    revokeRefreshToken(record.id);
    return rejectAuth(c);
  }
  return c.json(sessionPayload(record.userId));
});

authRoutes.post("/logout", (c) => {
  const session = readRefreshSession(c);
  if (session) revokeRefreshToken(session.id);
  clearAuthCookies(c);
  return c.body(null, 204);
});

authRoutes.get("/me", (c) => {
  const session = sessionPayload(c.get("userId"));
  return session ? c.json(session) : c.json({ error: "Unauthorized" }, 401);
});
