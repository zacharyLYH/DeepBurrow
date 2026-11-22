import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const ISSUER = "deepburrow";
const AUDIENCE = { access: "deepburrow-access", refresh: "deepburrow-refresh" } as const;

export const secret = process.env.AUTH_SECRET ?? "dev-only-auth-secret-change-me-32-chars";
if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required in production");
}

// Separate derived keys keep one token type from being accepted as another.
const key = (audience: string) =>
  createHmac("sha256", secret).update(`deepburrow:${audience}`).digest();

export const ACCESS_TTL = 15 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;
export const COOKIE_SECURE = process.env.NODE_ENV === "production";

type Claims = {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  sid?: string;
  jti?: string;
};

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

const sign = (claims: Claims, audience: string) => {
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(claims);
  const signature = createHmac("sha256", key(audience))
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
};

const verify = (token: string, audience: string, ignoreExpiry = false): Claims | null => {
  const [head, body, signature] = token.split(".");
  if (!head || !body || !signature) return null;

  let header: { alg?: unknown };
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: unknown };
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", key(audience))
    .update(`${head}.${body}`)
    .digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let claims: Claims;
  try {
    claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    typeof claims.sub !== "string" ||
    claims.iss !== ISSUER ||
    claims.aud !== audience ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    claims.iat > now + 60 ||
    (!ignoreExpiry && claims.exp <= now)
  ) {
    return null;
  }
  return claims;
};

export function signAccess(userId: string, ttl = ACCESS_TTL) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    { sub: userId, iss: ISSUER, aud: AUDIENCE.access, iat: now, exp: now + ttl },
    AUDIENCE.access,
  );
}

export function verifyAccess(token: string) {
  return verify(token, AUDIENCE.access);
}

export function signRefresh(
  userId: string,
  sessionId: string,
  tokenId: string,
  expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL,
) {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      sub: userId,
      sid: sessionId,
      jti: tokenId,
      iss: ISSUER,
      aud: AUDIENCE.refresh,
      iat: now,
      exp: expiresAt,
    },
    AUDIENCE.refresh,
  );
}

export const verifyRefresh = (token: string, ignoreExpiry = false) =>
  verify(token, AUDIENCE.refresh, ignoreExpiry);

export function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}
