import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const ISSUER = "deepburrow";
const AUDIENCE = "deepburrow-access";

export const secret = process.env.AUTH_SECRET ?? "dev-only-auth-secret-change-me-32-chars";
if (secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
if (process.env.NODE_ENV === "production" && !process.env.AUTH_SECRET) {
  throw new Error("AUTH_SECRET is required in production");
}

// Domain separation keeps this key from being reused for other HMACs.
const signingKey = createHmac("sha256", secret).update(`deepburrow:${AUDIENCE}`).digest();

export const ACCESS_TTL = 15 * 60;
export const REFRESH_TTL = 30 * 24 * 60 * 60;
export const COOKIE_SECURE = process.env.NODE_ENV === "production";

type Claims = {
  sub: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
};

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

const sign = (claims: Claims) => {
  const head = encode({ alg: "HS256", typ: "JWT" });
  const body = encode(claims);
  const signature = createHmac("sha256", signingKey)
    .update(`${head}.${body}`)
    .digest("base64url");
  return `${head}.${body}.${signature}`;
};

const verify = (token: string): Claims | null => {
  const [head, body, signature] = token.split(".");
  if (!head || !body || !signature) return null;

  let header: { alg?: unknown };
  try {
    header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: unknown };
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  const expected = createHmac("sha256", signingKey)
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
    claims.aud !== AUDIENCE ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    claims.iat > now + 60 ||
    claims.exp <= now
  ) {
    return null;
  }
  return claims;
};

export function signAccess(userId: string, ttl = ACCESS_TTL) {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, iss: ISSUER, aud: AUDIENCE, iat: now, exp: now + ttl });
}

export function verifyAccess(token: string) {
  return verify(token);
}

export function digest(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

export function digestMatches(value: string, hash: string) {
  const actual = Buffer.from(digest(value));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
