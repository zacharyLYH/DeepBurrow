import { titleFromAsk } from "../../../packages/types/src/header.ts";
import type { Source } from "../../../packages/types/src/types.ts";

type ModelTask = "plan" | "compose" | "summarize";
type Message = { role: "system" | "user"; content: string };
export type Model = { complete(task: ModelTask, messages: Message[]): Promise<string> };

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stands in for plan/compose model latency, and makes the pending state visible.
const LATENCY_MS = Number(process.env.FAKE_LATENCY_MS ?? 200);

// Test seam: the first summarize for an ask containing this marker throws, so the
// failure path is exercised for real. The browser never sends it.
const FAIL_ASK = process.env.FAKE_FAIL_ASK;

const SOURCES: Source[] = [
  { title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" },
  { title: "RFC 9002", url: "https://www.rfc-editor.org/rfc/rfc9002" },
];

const userText = (messages: Message[]) =>
  messages.filter((message) => message.role === "user").at(-1)?.content ?? "";

const failedOnce = new Set<string>();

// Deterministic: same messages in, same text out. Swapped for the real
// OpenAI-compatible adapter in M7.
export const fakeModel: Model = {
  async complete(task, messages) {
    await delay(LATENCY_MS);
    const ask = userText(messages);

    if (FAIL_ASK && ask.includes(FAIL_ASK) && !failedOnce.has(ask)) {
      failedOnce.add(ask);
      throw new Error("Model timed out");
    }

    if (task === "plan") return JSON.stringify({ gaps: [] });
    if (task === "compose") return `Notes: ${ask}`;

    const title = titleFromAsk(ask) || "Untitled";
    return [
      `TITLE: ${title}`,
      `SOURCES: ${SOURCES.map((source) => `${source.title} — ${source.url}`).join(" | ")}`,
      "FOLLOWUPS: Why double per RTT? | When does CUBIC win?",
      "",
      `${title} comes down to how the sender reads congestion signals, then when it backs off. Start with the signal, then the growth rule, then the failure case.`,
    ].join("\n");
  },
};
