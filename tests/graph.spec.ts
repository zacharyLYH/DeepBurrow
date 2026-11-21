import { expect, test } from "@playwright/test";
import { buildGraph, type AgentProviders, type GraphChunk } from "../apps/api/src/graph.ts";
import type { ChatMessage, ChatReply, Model, ToolSpec } from "../apps/api/src/llm.ts";
import { sourcesFromMarkdown } from "../apps/api/src/search.ts";
import { validateAnswer } from "../apps/api/src/validate.ts";

const ANSWER = [
  "TITLE: Additive increase",
  "FOLLOWUPS: How does loss cut the window? | Why probe every RTT?",
  "",
  "Grow by one segment per RTT, halve on loss.",
].join("\n");
const BODY = "Grow by one segment per RTT, halve on loss.";
const EVIDENCE = "Pages: https://a.example/one and https://a.example/one and https://b.example/two.";
const EVIDENCE_URLS = new Set(["https://a.example/one", "https://b.example/two"]);

type Turn = { messages: ChatMessage[]; tools?: ToolSpec[]; sessionId?: string };

const reply = (content: string): ChatReply => ({ content, toolCalls: [] });

const searchCall = (query: string, id = "call_1"): ChatReply => ({
  content: "",
  toolCalls: [
    { id, type: "function", function: { name: "web_search", arguments: JSON.stringify({ query }) } },
  ],
});

function script(options: {
  replies?: ChatReply[];
  fixes?: string[];
  search?: AgentProviders["search"];
}) {
  const turns: Turn[] = [];
  const replies = [...(options.replies ?? [])];
  const fixes = [...(options.fixes ?? [])];
  const model: Model = async (messages, setup = {}) => {
    turns.push({ messages, tools: setup.tools, sessionId: setup.sessionId });
    if ((messages.at(-1)?.content ?? "").startsWith("Revise the previous response")) {
      return reply(fixes.shift() ?? "");
    }
    return replies.shift() ?? reply("");
  };
  return { turns, providers: { model, search: options.search } as AgentProviders };
}

async function run(providers: AgentProviders, input = "What is additive increase?", lineage = "") {
  const chunks: GraphChunk[] = [];
  const events = await buildGraph(providers).stream(
    { ask: input, lineage, sessionId: "session_1" },
    { streamMode: "custom" },
  );
  for await (const chunk of events) chunks.push(chunk as GraphChunk);
  return chunks;
}

const progress = (chunks: GraphChunk[]) =>
  chunks.flatMap((chunk) => (chunk.type === "progress" ? [chunk.line] : []));
const tokens = (chunks: GraphChunk[]) =>
  chunks.flatMap((chunk) => (chunk.type === "token" ? [chunk.text] : [])).join("");
const metaOf = (chunks: GraphChunk[]) => {
  const meta = chunks.find((chunk) => chunk.type === "meta");
  if (meta?.type !== "meta") throw new Error("no meta chunk");
  return meta;
};

test("a web_search tool call answers from the raw results with mechanical sources", async () => {
  const seen: string[] = [];
  const { turns, providers } = script({
    replies: [searchCall("additive increase"), reply(ANSWER)],
    search: async (query) => {
      seen.push(query);
      return EVIDENCE;
    },
  });

  const chunks = await run(providers, "What is additive increase?", "Parent answer");

  expect(seen).toEqual(["additive increase"]);
  expect(turns).toHaveLength(2);
  expect(turns.every((turn) => turn.sessionId === "session_1")).toBe(true);
  expect(turns[0].tools?.map((tool) => tool.function.name)).toEqual(["web_search"]);
  expect(turns[1].messages.map((message) => message.role)).toEqual([
    "system",
    "user",
    "user",
    "assistant",
    "tool",
  ]);
  expect(turns[1].messages[3].tool_calls?.[0]).toMatchObject({ id: "call_1", type: "function" });
  expect(turns[1].messages[4]).toEqual({
    role: "tool",
    tool_call_id: "call_1",
    content: EVIDENCE,
  });

  expect(metaOf(chunks)).toMatchObject({
    title: "Additive increase",
    followups: ["How does loss cut the window?", "Why probe every RTT?"],
    sources: [
      { title: "https://a.example/one", url: "https://a.example/one" },
      { title: "https://b.example/two", url: "https://b.example/two" },
    ],
  });
  expect(tokens(chunks)).toBe(BODY);
  expect(progress(chunks)).toEqual([
    "Writing the answer…",
    "Searching the web…",
    "Writing the answer…",
  ]);
});

test("search stops after three rounds, then the model answers without the tool", async () => {
  let searches = 0;
  const { turns, providers } = script({
    replies: [
      searchCall("one", "call_1"),
      searchCall("two", "call_2"),
      searchCall("three", "call_3"),
      reply(ANSWER),
    ],
    search: async () => {
      searches += 1;
      return EVIDENCE;
    },
  });

  const chunks = await run(providers);

  expect(searches).toBe(3);
  expect(turns).toHaveLength(4);
  expect(turns[3].tools).toBeUndefined();
  expect(progress(chunks)).toEqual([
    "Writing the answer…",
    "Searching the web…",
    "Writing the answer…",
    "Searching the web…",
    "Writing the answer…",
    "Searching the web…",
    "Writing the answer…",
  ]);
  // URLs are deduped across rounds.
  expect(metaOf(chunks).sources).toHaveLength(2);
});

test("no search provider answers directly without offering the tool", async () => {
  const { turns, providers } = script({ replies: [reply(ANSWER)] });
  const chunks = await run(providers);

  expect(turns).toHaveLength(1);
  expect(turns[0].tools).toBeUndefined();
  expect(progress(chunks)).toEqual(["Writing the answer…"]);
  expect(metaOf(chunks).sources).toEqual([]);
  expect(tokens(chunks)).toBe(BODY);
});

test("a failed search is reported to the model and the answer continues", async () => {
  const { turns, providers } = script({
    replies: [searchCall("additive increase"), reply(ANSWER)],
    search: async () => {
      throw new Error("search down");
    },
  });
  const chunks = await run(providers);

  expect(progress(chunks)).toContain("Search failed; continuing.");
  expect(metaOf(chunks).sources).toEqual([]);
  expect(turns).toHaveLength(2);
  expect(turns[1].messages.at(-1)).toEqual({
    role: "tool",
    tool_call_id: "call_1",
    content: "Search failed.",
  });
});

test("an empty search response answers as if there were no evidence", async () => {
  const { turns, providers } = script({
    replies: [searchCall("additive increase"), reply(ANSWER)],
    search: async () => "  ",
  });
  const chunks = await run(providers);

  expect(metaOf(chunks).sources).toEqual([]);
  expect(tokens(chunks)).toBe(BODY);
  expect(turns[1].messages.at(-1)).toEqual({
    role: "tool",
    tool_call_id: "call_1",
    content: "No search results.",
  });
});

test("a malformed answer is repaired before anything streams", async () => {
  const broken = ["TITLE: Draft", "", "Draft body."].join("\n");
  const { turns, providers } = script({ replies: [reply(broken)], fixes: [ANSWER] });
  const chunks = await run(providers);

  expect(turns).toHaveLength(2);
  const repair = turns[1].messages.at(-1)?.content ?? "";
  expect(repair).toContain("Draft body.");
  expect(repair).toContain("FOLLOWUPS must list 2–3 questions");
  expect(tokens(chunks)).toBe(BODY);
  expect(metaOf(chunks).title).toBe("Additive increase");
});

test("repair exhaustion keeps a usable body", async () => {
  const broken = ["TITLE: Draft", "", "Draft body."].join("\n");
  const { turns, providers } = script({ replies: [reply(broken)], fixes: [broken, broken] });
  const chunks = await run(providers);

  expect(turns).toHaveLength(3);
  expect(tokens(chunks)).toBe("Draft body.");
  expect(metaOf(chunks).followups).toEqual([]);
});

test("an answer with no body fails after repairs", async () => {
  const headerOnly = "TITLE: Draft\nFOLLOWUPS: One? | Two?\n\n";
  const { providers } = script({ replies: [reply(headerOnly)], fixes: [headerOnly, headerOnly] });

  await expect(run(providers)).rejects.toThrow("Empty answer");
});

test("cancellation aborts the run mid-call", async () => {
  const controller = new AbortController();
  const model: Model = (_messages, options) =>
    new Promise<ChatReply>((_resolve, reject) => {
      setTimeout(() => controller.abort(), 10);
      options?.signal?.addEventListener("abort", () => reject(new Error("stopped")));
    });

  const events = await buildGraph({ model }).stream(
    { ask: "Q", lineage: "", sessionId: "session_1" },
    { streamMode: "custom", signal: controller.signal },
  );
  const drain = async () => {
    for await (const _chunk of events) void _chunk;
  };
  await expect(drain()).rejects.toThrow();
});

test("validation defers to the real math and mermaid runtimes", async () => {
  expect((await validateAnswer(ANSWER)).errors).toEqual([]);
  expect((await validateAnswer("TITLE: x\n\nBody")).errors).toContain("FOLLOWUPS must list 2–3 questions");
  expect((await validateAnswer("FOLLOWUPS: a? | b?\n\nBody")).errors).toContain("TITLE is missing");
  expect(
    (await validateAnswer("TITLE: x\nFOLLOWUPS: a? | b?\n\n```js\nx")).errors,
  ).toContain("Unclosed code fence");
  expect(
    (await validateAnswer("TITLE: x\nFOLLOWUPS: a? | b?\n\n[bad](javascript:alert(1))")).errors.join(),
  ).toContain("not HTTP(S)");
  expect(
    (await validateAnswer("TITLE: x\nFOLLOWUPS: a? | b?\n\n$\\frac{1}$")).errors.join(),
  ).toContain("Math error");
  expect(
    (await validateAnswer("TITLE: x\nFOLLOWUPS: a? | b?\n\n```mermaid\nnot a diagram\n```")).errors.join(),
  ).toContain("Mermaid error");
  expect(
    (await validateAnswer(["TITLE: x", "FOLLOWUPS: a? | b?", "", "```md", "# heading", "```"].join("\n"))).errors,
  ).toContain("Answer is wrapped in one code block");
  expect(
    (await validateAnswer("TITLE: x\nFOLLOWUPS: a? | b?\n\n[ok](https://nope.example)", EVIDENCE_URLS)).errors.join(),
  ).toContain("not in the search results");

  const validRich = [
    "TITLE: x",
    "FOLLOWUPS: a? | b?",
    "",
    "Inline $a^2$ and:",
    "",
    "```mermaid",
    "graph TD",
    "  A-->B",
    "```",
  ].join("\n");
  expect((await validateAnswer(validRich)).errors).toEqual([]);
});

test("sources are deduped https URLs titled by URL", () => {
  expect(sourcesFromMarkdown("https://a.example/x. https://a.example/x, https://b.example/y)")).toEqual([
    { title: "https://a.example/x", url: "https://a.example/x" },
    { title: "https://b.example/y", url: "https://b.example/y" },
  ]);
  expect(sourcesFromMarkdown("no links here")).toEqual([]);
  expect(
    sourcesFromMarkdown("See https://en.wikipedia.org/wiki/Thymbra_(plant) and [x](https://b.example/y)."),
  ).toEqual([
    {
      title: "https://en.wikipedia.org/wiki/Thymbra_(plant)",
      url: "https://en.wikipedia.org/wiki/Thymbra_(plant)",
    },
    { title: "https://b.example/y", url: "https://b.example/y" },
  ]);
});
