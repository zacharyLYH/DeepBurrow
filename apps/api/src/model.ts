import { titleFromAsk } from "../../../packages/types/src/header.ts";
import type { Source } from "../../../packages/types/src/types.ts";

type ModelTask = "plan" | "compose" | "judge" | "summarize";
type Message = { role: "system" | "user"; content: string };
export type Model = {
  complete(task: ModelTask, messages: Message[], round?: number): Promise<string>;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stands in for model latency, and makes the pending/progress state visible.
const LATENCY_MS = Number(process.env.FAKE_LATENCY_MS ?? 200);

// Test seam: the first summarize for an ask containing this marker throws, so the
// failure path is exercised for real. The browser never sends it.
const FAIL_ASK = process.env.FAKE_FAIL_ASK;

const SOURCES: Source[] = [
  { title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" },
  { title: "RFC 9002", url: "https://www.rfc-editor.org/rfc/rfc9002" },
];

const SEED_QUESTIONS = ["Why double per RTT?", "When does CUBIC win?"];

export type FakeOptions = {
  rounds?: number;
  verdict?: "done" | "continue";
  failRound?: number;
};

const userText = (messages: Message[]) =>
  messages.filter((message) => message.role === "user").at(-1)?.content ?? "";

// Deterministic: same messages in, same text out. Swapped for the real
// OpenAI-compatible adapter in M7. Scripting knobs let tests drive the loop.
export function fakeModel(options: FakeOptions = {}): Model {
  const rounds = options.rounds ?? Number(process.env.FAKE_ROUNDS ?? 1);
  const envVerdict = process.env.FAKE_VERDICT;
  const verdict =
    options.verdict ??
    (envVerdict === "done" || envVerdict === "continue" ? envVerdict : undefined);
  const failRound = options.failRound ?? Number(process.env.FAKE_FAIL_ROUND ?? 0);
  const failedOnce = new Set<string>();

  return {
    async complete(task, messages, round = 1) {
      await delay(LATENCY_MS);
      const ask = userText(messages);

      if (FAIL_ASK && ask.includes(FAIL_ASK) && !failedOnce.has(ask)) {
        failedOnce.add(ask);
        throw new Error("Model timed out");
      }
      if (failRound && round === failRound) throw new Error(`Round ${round} failed`);

      if (task === "plan") return JSON.stringify({ suggestedQuestions: SEED_QUESTIONS });
      if (task === "compose") return `Notes on ${ask}: congestion signal, then growth rule.`;

      if (task === "judge") {
        const done = verdict === "done" || (verdict !== "continue" && round >= rounds);
        return JSON.stringify({
          done,
          suggestedQuestions: done ? [] : [`What is still open after round ${round}?`],
        });
      }

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
}
