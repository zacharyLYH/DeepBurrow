import { createECDH } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

const file = new URL("../apps/api/.env", import.meta.url);
const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
const get = (key) =>
  lines.find((line) => line.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
const set = (key, value) => {
  const at = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (at >= 0) lines[at] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
};

if (!get("VAPID_PUBLIC_KEY") || !get("VAPID_PRIVATE_KEY")) {
  const pair = createECDH("prime256v1");
  pair.generateKeys();
  set("VAPID_PUBLIC_KEY", pair.getPublicKey().toString("base64url"));
  set("VAPID_PRIVATE_KEY", pair.getPrivateKey().toString("base64url"));
}

let subject = get("VAPID_SUBJECT") || process.env.VAPID_SUBJECT?.trim() || "";
if (!subject && process.stdin.isTTY) {
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  subject = (await prompt.question("VAPID_SUBJECT (mailto:you@example.com or https://...): ")).trim();
  prompt.close();
}
if (!/^(mailto:|https:\/\/)/.test(subject)) {
  console.error("VAPID_SUBJECT must start with mailto: or https://");
  process.exit(1);
}
set("VAPID_SUBJECT", subject);

writeFileSync(file, `${lines.filter(Boolean).join("\n")}\n`);
