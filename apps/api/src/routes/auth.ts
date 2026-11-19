import { Hono } from "hono";
import {
  clearAuthCookies,
  issueRefresh,
  issueSession,
  penalize,
  readRefreshCookie,
  rejectAuth,
  sessionPayload,
  throttled,
  type AuthEnv,
} from "../auth.ts";
import {
  consumeRefreshToken,
  createAccount,
  findUserByEmail,
  getAuthUser,
  refreshRecord,
  revokeAllSessions,
  revokeSession,
  setPassword,
} from "../db.ts";
import {
  REFRESH_TTL,
  digest,
  hashPassword,
  verifyPassword,
  verifyRefresh,
} from "../security.ts";

type Credentials = { email?: unknown; password?: unknown };

export const authRoutes = new Hono<AuthEnv>();

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const validPassword = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 10 && value.length <= 200;

const validEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

authRoutes.post("/sign-up", async (c) => {
  if (throttled(c, "sign-up")) return c.json({ error: "Too many attempts" }, 429);
  const body = await c.req.json<Credentials>().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!validEmail(email) || !validPassword(password)) {
    penalize(c, "sign-up");
    return c.json({ error: "Use a valid email and a password of at least 10 characters" }, 400);
  }
  try {
    const user = createAccount(email, hashPassword(password));
    issueSession(c, user.id);
    return c.json(sessionPayload(user.id), 201);
  } catch {
    penalize(c, "sign-up");
    return c.json({ error: "Could not create account" }, 409);
  }
});

authRoutes.post("/sign-in", async (c) => {
  if (throttled(c, "sign-in")) return c.json({ error: "Too many attempts" }, 429);
  const body = await c.req.json<Credentials>().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  const user = findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    penalize(c, "sign-in");
    return c.json({ error: "Invalid email or password" }, 401);
  }
  issueSession(c, user.id);
  return c.json(sessionPayload(user.id));
});

authRoutes.post("/refresh", async (c) => {
  const token = readRefreshCookie(c);
  const claims = token ? verifyRefresh(token) : null;
  if (!token || !claims?.sub || !claims.sid || !claims.jti) return rejectAuth(c);

  const record = refreshRecord(claims.sid, claims.jti);
  if (!record || record.userId !== claims.sub || record.tokenHash !== digest(token)) {
    return rejectAuth(c);
  }
  if (record.usedAt !== null) {
    revokeSession(record.sessionId);
    return rejectAuth(c);
  }
  const now = Date.now();
  if (
    record.sessionRevokedAt !== null ||
    record.sessionExpiresAt <= now ||
    record.tokenExpiresAt <= now ||
    !consumeRefreshToken(record.sessionId, record.tokenId)
  ) {
    return rejectAuth(c);
  }

  const expiresAt = Math.min(record.sessionExpiresAt, now + REFRESH_TTL * 1000);
  issueRefresh(c, record.userId, record.sessionId, expiresAt);
  return c.json(sessionPayload(record.userId));
});

authRoutes.post("/logout", (c) => {
  const token = readRefreshCookie(c);
  const claims = token ? verifyRefresh(token, true) : null;
  if (claims?.sid) revokeSession(claims.sid);
  clearAuthCookies(c);
  return c.body(null, 204);
});

authRoutes.get("/me", (c) => {
  const session = sessionPayload(c.get("userId"));
  return session ? c.json(session) : c.json({ error: "Unauthorized" }, 401);
});

authRoutes.post("/change-password", async (c) => {
  const body = await c.req
    .json<{ currentPassword?: unknown; newPassword?: unknown }>()
    .catch(() => null);
  const current = body?.currentPassword;
  const next = body?.newPassword;
  if (!validPassword(next)) {
    return c.json({ error: "New password must be at least 10 characters" }, 400);
  }
  const user = getAuthUser(c.get("userId"));
  if (!user || typeof current !== "string" || !verifyPassword(current, user.passwordHash)) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }
  if (verifyPassword(next, user.passwordHash)) {
    return c.json({ error: "Choose a different password" }, 400);
  }
  setPassword(user.id, hashPassword(next));
  revokeAllSessions(user.id);
  clearAuthCookies(c);
  return c.body(null, 204);
});
