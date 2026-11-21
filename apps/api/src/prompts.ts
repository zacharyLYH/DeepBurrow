import { readFileSync } from "node:fs";

const read = (file: string) =>
  readFileSync(new URL(`../prompts/${file}`, import.meta.url), "utf8").trim();

export const SYSTEM_PROMPT = read("system.md");
export const REPAIR_PROMPT = read("repair.md");
