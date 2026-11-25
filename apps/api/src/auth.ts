import { randomBytes, randomUUID } from "node:crypto";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";
import {
  createRefreshToken,
  getUser,
  primaryBurrow,
  rotateRefreshToken,
  type RefreshRecord,
} from "./db.ts";
import {
  ACCESS_TTL,
  COOKIE_SECURE,
  REFRESH_TTL,
  digest,
  signAccess,
  verifyAccess,
} from "./security.ts";

export type AuthEnv = { Variables: { userId: string } };
export type AuthContext = Context<AuthEnv>;

const ACCESS_COOKIE = "db_access";
const REFRESH_COOKIE = "db_refresh";
const REFRESH_PATH = "/api/auth";
const PUBLIC = new Set([
  "/health",
  "/auth/email",
  "/auth/verify",
  "/auth/refresh",
  "/auth/logout",
]);

const cookieOptions = { httpOnly: true, sameSite: "Lax" as const, secure: COOKIE_SECURE };
const accessCookie = { ...cookieOptions, path: "/" };
const refreshCookie = { ...cookieOptions, path: REFRESH_PATH };
const ATTEMPT_LIMIT = 10;
const ATTEMPT_WINDOW = 15 * 60 * 1000;
const failures = new Map<string, { count: number; reset: number }>();
const configuredOrigins = new Set(
  (process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const attemptKey = (c: AuthContext, scope: string) => {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return `${scope}:${forwarded ?? c.req.header("x-real-ip") ?? "local"}`;
};

export function throttled(c: AuthContext, scope: string) {
  const bucket = failures.get(attemptKey(c, scope));
  return Boolean(bucket && bucket.reset > Date.now() && bucket.count >= ATTEMPT_LIMIT);
}

export function penalize(c: AuthContext, scope: string) {
  const key = attemptKey(c, scope);
  const now = Date.now();
  const bucket = failures.get(key);
  if (!bucket || bucket.reset <= now) failures.set(key, { count: 1, reset: now + ATTEMPT_WINDOW });
  else bucket.count += 1;
}

export const sessionPayload = (userId: string) => {
  const user = getUser(userId);
  const burrow = primaryBurrow(userId);
  return user && burrow
    ? {
        user: { id: user.id, email: user.email },
        burrowId: burrow.id,
      }
    : null;
};

const newRefresh = (id: string) => {
  const secret = randomBytes(32).toString("base64url");
  return { token: `${id}.${secret}`, hash: digest(secret) };
};

export function issueRefresh(c: AuthContext, record: RefreshRecord) {
  const next = newRefresh(record.id);
  if (!rotateRefreshToken(record.id, record.tokenHash, next.hash)) return false;
  writeAuthCookies(c, record.userId, next.token, record.expiresAt);
  return true;
}

export function issueSession(c: AuthContext, userId: string) {
  const id = randomUUID();
  const next = newRefresh(id);
  const expiresAt = Date.now() + REFRESH_TTL * 1000;
  createRefreshToken(id, userId, next.hash, expiresAt);
  writeAuthCookies(c, userId, next.token, expiresAt);
}

function writeAuthCookies(
  c: AuthContext,
  userId: string,
  refreshToken: string,
  expiresAt: number,
) {
  const remaining = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
  setCookie(c, ACCESS_COOKIE, signAccess(userId), { ...accessCookie, maxAge: ACCESS_TTL });
  setCookie(c, REFRESH_COOKIE, refreshToken, { ...refreshCookie, maxAge: remaining });
}

export function clearAuthCookies(c: AuthContext) {
  deleteCookie(c, ACCESS_COOKIE, accessCookie);
  deleteCookie(c, REFRESH_COOKIE, refreshCookie);
}

export function readRefreshSession(c: AuthContext) {
  const [id, secret, ...rest] = (getCookie(c, REFRESH_COOKIE) ?? "").split(".");
  if (!id || !secret || rest.length > 0) return null;
  return { id, secret };
}

export function rejectAuth(c: AuthContext) {
  clearAuthCookies(c);
  return c.json({ error: "Unauthorized" }, 401);
}

// Local development and the local Docker build always run on localhost, so
// those origins are allowed in addition to APP_ORIGIN.
const localOrigin = (origin: string) => {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
};

export const guard: MiddlewareHandler<AuthEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && !configuredOrigins.has(origin) && !localOrigin(origin)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (!origin && c.req.header("sec-fetch-site") === "cross-site") {
      return c.json({ error: "Forbidden" }, 403);
    }
  }

  if (PUBLIC.has(c.req.path)) return next();

  const token = getCookie(c, ACCESS_COOKIE);
  const claims = token ? verifyAccess(token) : null;
  const user = claims ? getUser(claims.sub) : null;
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("userId", user.id);
  await next();
};

