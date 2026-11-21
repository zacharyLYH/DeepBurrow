import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { secret } from "./security.ts";

const KEY = createHash("sha256").update(`deepburrow:provider:${secret}`).digest();

export function seal(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}

export function unseal(sealed: string) {
  const buffer = Buffer.from(sealed, "base64");
  const decipher = createDecipheriv("aes-256-gcm", KEY, buffer.subarray(0, 12));
  decipher.setAuthTag(buffer.subarray(12, 28));
  return Buffer.concat([decipher.update(buffer.subarray(28)), decipher.final()]).toString("utf8");
}
