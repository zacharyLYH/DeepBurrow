import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { secret } from "./security.ts";

const TTL = Number(process.env.CODE_TTL_MS ?? 10 * 60_000);
const RESEND = Number(process.env.CODE_RESEND_MS ?? 30_000);
const MAX_ATTEMPTS = 5;

type Entry = { hash: Buffer; expiresAt: number; attempts: number; sentAt: number };

// Codes are single-use, short-lived and lost on restart; nothing is persisted.
const codes = new Map<string, Entry>();

const hash = (email: string, code: string) =>
  createHmac("sha256", secret).update(`${email}:${code}`).digest();

// Null means the resend cooldown is still active.
export function issueCode(email: string): string | null {
  const now = Date.now();
  const current = codes.get(email);
  if (current && current.sentAt + RESEND > now) return null;
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  codes.set(email, { hash: hash(email, code), expiresAt: now + TTL, attempts: 0, sentAt: now });
  return code;
}

export function discardCode(email: string) {
  codes.delete(email);
}

export function consumeCode(email: string, code: string) {
  const entry = codes.get(email);
  if (!entry) return false;
  if (entry.expiresAt <= Date.now()) {
    codes.delete(email);
    return false;
  }
  const actual = hash(email, code);
  if (actual.length !== entry.hash.length || !timingSafeEqual(actual, entry.hash)) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) codes.delete(email);
    return false;
  }
  codes.delete(email);
  return true;
}
