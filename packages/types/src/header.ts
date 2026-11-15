import type { Event, Meta, Source } from "./types.ts";

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null;

export function parseEvent(raw: unknown): Event {
  if (!isObj(raw) || typeof raw.type !== "string" || typeof raw.nodeId !== "string") {
    throw new Error("bad event");
  }
  const { type } = raw;
  if (type === "node.pending" || type === "node.done") return raw as Event;
  if (type === "node.token" && typeof raw.text === "string") return raw as Event;
  if (type === "node.error" && typeof raw.reason === "string") return raw as Event;
  if (type === "node.meta") {
    const { title, sources, followups } = raw;
    if (typeof title !== "string" || !Array.isArray(sources) || !Array.isArray(followups)) {
      throw new Error("bad meta");
    }
    return raw as Event;
  }
  throw new Error(`bad event type: ${type}`);
}

const HEADER = /^(TITLE|SOURCES|FOLLOWUPS):\s?(.*)$/;

const splitList = (value: string) =>
  value
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

export const parseSources = (value: string): Source[] =>
  splitList(value).map((item) => {
    const [title, url = ""] = item.split(" — ");
    return { title: title.trim(), url: url.trim() };
  });

export function parseHeader(text: string): { meta: Meta; body: string } {
  const lines = text.split("\n");
  const meta: Meta = { title: "", sources: [], followups: [] };
  let i = 0;
  for (; i < lines.length; i++) {
    const match = lines[i].match(HEADER);
    if (!match) break;
    const [, key, value] = match;
    if (key === "TITLE") meta.title = value.trim();
    if (key === "SOURCES") meta.sources = parseSources(value);
    if (key === "FOLLOWUPS") meta.followups = splitList(value);
  }
  return { meta, body: lines.slice(i).join("\n") };
}
