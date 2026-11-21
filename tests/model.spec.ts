import { expect, test, type Page } from "@playwright/test";
import { buildAsk } from "../packages/types/src/header.ts";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";
import { clearProviders, readProviderRow, resetDemoBurrow } from "./db.ts";
import { burrowNodes, open, signIn } from "./helpers.ts";
import {
  startMockProvider,
  toolCallReply,
  type MockCall,
  type MockProvider,
  type MockReply,
} from "./mock-provider.ts";
import { parseEvents } from "../packages/types/src/sse.ts";

const CHAT_MODEL = "mock/chat";
const SEARCH_MODEL = "mock/search";
const KEY = "sk-test-secret";
const QUESTION = "How does additive increase work?";
const ANSWER = [
  "TITLE: Additive increase and loss",
  "FOLLOWUPS: Why halve on loss? | When does CUBIC win?",
  "",
  "Additive increase adds one segment per RTT, then halves on loss.",
].join("\n");
const BODY = "Additive increase adds one segment per RTT, then halves on loss.";
const EVIDENCE = [
  "# Search results",
  "",
  "Additive increase adds one segment per RTT. See https://one.example/tcp",
  "Duplicate: https://one.example/tcp",
  "Cubic source: https://two.example/cubic",
  "Trailing punctuation https://three.example/page.",
].join("\n");

let provider: MockProvider;
let baseUrl = "";
let chatCount = 0;

const resetTurns = () => {
  provider.reset();
  chatCount = 0;
};

const useReply = (reply: MockReply) => provider.setReply(reply);

const wantsTool = (call: MockCall) =>
  Boolean(call.tools?.some((tool) => tool.function?.name === "web_search")) &&
  !call.messages.some((message) => message.role === "tool");

// Search calls are identified by the extractor fields, LLM turns by their absence.
const defaultReply = (): MockReply => (call) => {
  if (call.maxResults !== undefined) return { content: EVIDENCE };
  if (wantsTool(call)) return toolCallReply("additive increase");
  return { content: ANSWER };
};

test.beforeAll(async () => {
  provider = await startMockProvider({ latencyMs: 0 });
  baseUrl = provider.url;
});

test.afterAll(() => provider.close());

test.beforeEach(() => {
  resetDemoBurrow();
  resetTurns();
  useReply(defaultReply());
});

async function connect(page: Page, kind: "model" | "search") {
  const response = await page.request.post(`/api/settings/${kind}`, {
    data: { baseUrl, model: kind === "search" ? SEARCH_MODEL : CHAT_MODEL, apiKey: KEY },
  });
  expect(response.ok()).toBe(true);
  // The verification call is not part of the run under test.
  resetTurns();
}

async function ask(page: Page, question = QUESTION, parentId = "node_root") {
  const response = await page.request.post("/api/ask", {
    data: { parentId, origin: { question } },
  });
  expect(response.ok()).toBe(true);
  return parseEvents(await response.text());
}

test("model setup verifies before save and never returns the key", async ({ page }) => {
  await signIn(page);
  const seeded = readProviderRow();
  const invalid = '{"error":{"message":"Invalid API key"}}';
  useReply(() => ({ status: 401, raw: invalid }));

  const rejected = await page.request.post("/api/settings/model", {
    data: { baseUrl, model: "mock/bad", apiKey: "sk-bad" },
  });
  expect(rejected.status()).toBe(400);
  expect(((await rejected.json()) as { error: string }).error).toBe(invalid);

  // A failed verification never overwrites the stored provider.
  const unchanged = readProviderRow();
  expect(unchanged?.base_url).toBe(seeded?.base_url);
  expect(unchanged?.model).toBe(seeded?.model);

  useReply(defaultReply());
  await connect(page, "model");

  const text = await (await page.request.get("/api/settings")).text();
  expect(text).not.toContain(KEY);
  const settings = JSON.parse(text) as {
    model: { configured: boolean; model: string; baseUrl: string };
  };
  expect(settings.model).toMatchObject({ configured: true, model: CHAT_MODEL, baseUrl });

  const row = readProviderRow();
  expect(row?.base_url).toBe(baseUrl);
  expect(Buffer.from(row!.api_key_enc!).toString()).not.toContain(KEY);
});

test("a configured model is not health-checked at login", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  useReply(() => ({ status: 500, raw: "down" }));

  const me = await page.request.get("/api/auth/me");
  expect(me.ok()).toBe(true);
  const session = (await me.json()) as { configured: { model: boolean; search: boolean } };
  expect(session.configured).toEqual({ model: true, search: false });
  expect(provider.calls).toHaveLength(0);
});

test("an ask without a model fails clearly", async ({ page }) => {
  await signIn(page);
  clearProviders();

  const events = await ask(page);
  const done = events.at(-1);
  if (done?.type !== "node.error") throw new Error("expected an error event");
  expect(done.node.status).toBe("failed");
  expect(done.node.error).toContain("Model not configured");
  expect(provider.calls).toHaveLength(0);
});

test("the model calls web_search and answers from the raw results verbatim", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  await connect(page, "search");

  const events = await ask(page, QUESTION, "node_why");
  const done = events.at(-1);
  if (done?.type !== "node.done") throw new Error("no terminal event");
  expect(done.node.status).toBe("answered");

  const meta = events.find((event) => event.type === "node.meta");
  if (meta?.type !== "node.meta") throw new Error("no meta");
  expect(meta.title).toBe("Additive increase and loss");
  expect(meta.followups).toEqual(["Why halve on loss?", "When does CUBIC win?"]);
  expect(meta.sources).toEqual([
    { title: "https://one.example/tcp", url: "https://one.example/tcp" },
    { title: "https://two.example/cubic", url: "https://two.example/cubic" },
    { title: "https://three.example/page", url: "https://three.example/page" },
  ]);

  const body = events.flatMap((event) => (event.type === "node.token" ? [event.text] : [])).join("");
  expect(body).toBe(BODY);
  expect(events.flatMap((event) => (event.type === "node.progress" ? [event.line] : []))).toEqual([
    "Writing the answer…",
    "Searching the web…",
    "Writing the answer…",
  ]);

  const search = provider.calls.find((call) => call.maxResults !== undefined);
  const chat = provider.calls.filter((call) => call.maxResults === undefined);

  // One tool call is one query, outside the LLM session and transcript.
  expect(search?.authorization).toBe(`Bearer ${KEY}`);
  expect(search?.session).toBeUndefined();
  expect(search?.bodySession).toBeUndefined();
  expect(search?.messages).toEqual([{ role: "user", content: "additive increase" }]);
  expect(search?.messages[0].content).not.toContain("TCP avoids collapse");

  // One session id for every LLM call in the run, header and body.
  expect(chat).toHaveLength(2);
  expect(chat[0].session).toBeTruthy();
  expect(chat[1].session).toBe(chat[0].session);
  expect(chat[0].bodySession).toBe(chat[0].session);
  expect(chat[1].bodySession).toBe(chat[0].session);

  // First turn: system, root→node transcript, frontend message, plus the tool.
  const firstTurn = chat[0].messages;
  expect(firstTurn.map((message) => message.role)).toEqual(["system", "user", "user"]);
  expect(firstTurn[0].content).toContain("wise, human-sounding teacher");
  expect(firstTurn[0].content).toContain("web_search");
  expect(firstTurn[1].content).toContain("TCP avoids collapse");
  expect(firstTurn[1].content).toContain("Each ACK acknowledges two segments");
  // Siblings stay out of the transcript.
  expect(firstTurn[1].content).not.toContain("CUBIC's cubic growth");
  expect(firstTurn.at(-1)?.content).toBe(buildAsk({ question: QUESTION }));
  expect(chat[0].tools?.map((tool) => tool.function?.name)).toEqual(["web_search"]);

  // Second turn carries the assistant tool call and the raw response as a tool result.
  const answerTurn = chat[1].messages;
  expect(answerTurn.map((message) => message.role)).toEqual([
    "system",
    "user",
    "user",
    "assistant",
    "tool",
  ]);
  expect(answerTurn[1].content).toBe(firstTurn[1].content);
  expect(answerTurn[3].tool_calls?.[0]?.function.name).toBe("web_search");
  expect(answerTurn[4]).toEqual({ role: "tool", tool_call_id: "call_search", content: EVIDENCE });

  const saved = (await burrowNodes(page)).find((node) => node.origin.question === QUESTION);
  expect(saved?.status).toBe("answered");
  expect(saved?.markdown).toBe(BODY);
  expect(saved?.sources).toEqual(meta.sources);
});

test("a failed search still answers", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  await connect(page, "search");
  useReply((call) => {
    if (call.maxResults !== undefined) return { status: 500, raw: "search down" };
    if (wantsTool(call)) return toolCallReply("additive increase");
    return { content: ANSWER };
  });

  const events = await ask(page);
  const meta = events.find((event) => event.type === "node.meta");
  if (meta?.type !== "node.meta") throw new Error("no meta");
  expect(meta.sources).toEqual([]);
  expect(
    events.some((event) => event.type === "node.progress" && event.line.includes("Search failed")),
  ).toBe(true);
  expect(events.at(-1)?.type).toBe("node.done");
});

test("a malformed answer is repaired using validator errors", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  const broken = ["TITLE: Draft answer", "", "Draft body."].join("\n");
  useReply((call) => {
    const last = call.messages.at(-1)?.content ?? "";
    return { content: last.startsWith("Revise the previous response") ? ANSWER : broken };
  });

  const events = await ask(page);
  const meta = events.find((event) => event.type === "node.meta");
  if (meta?.type !== "node.meta") throw new Error("no meta");
  expect(meta.title).toBe("Additive increase and loss");

  expect(provider.calls[0].tools).toBeUndefined();
  const repair = provider.calls.at(-1);
  expect(repair?.messages.at(-1)?.content).toContain("Draft body.");
  expect(repair?.messages.at(-1)?.content).toContain("FOLLOWUPS must list 2–3 questions");
  expect(
    events.flatMap((event) => (event.type === "node.token" ? [event.text] : [])).join(""),
  ).toBe(BODY);
});

test("bad credentials surface verbatim without a retry", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  const invalid = '{"error":{"message":"Invalid API key"}}';
  useReply(() => ({ status: 401, raw: invalid }));

  const events = await ask(page);
  const done = events.at(-1);
  if (done?.type !== "node.error") throw new Error("expected an error event");
  expect(done.node.status).toBe("failed");
  expect(done.node.error).toBe(invalid);
  expect(provider.calls).toHaveLength(1);
});

test("a transient provider error is retried once", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  useReply(() => {
    chatCount += 1;
    return chatCount === 1 ? { status: 500, raw: "upstream" } : { content: ANSWER };
  });

  const events = await ask(page);
  expect(events.at(-1)?.type).toBe("node.done");
  expect(provider.calls).toHaveLength(2);
});

test("a model call that outlives its deadline fails the node", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  useReply(() => ({ content: ANSWER, delay: 2600 }));

  const events = await ask(page);
  const done = events.at(-1);
  if (done?.type !== "node.error") throw new Error("expected an error event");
  expect(done.node.error).toBe("Model timed out");
  expect(provider.calls).toHaveLength(1);
});

test("stop settles a running node stopped", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  useReply(() => ({ content: ANSWER, delay: 800 }));

  const started = page.request.post("/api/ask", {
    data: { parentId: "node_root", origin: { question: "Stop me" } },
  });
  let pending: BurrowNode | undefined;
  for (let attempt = 0; attempt < 60 && !pending; attempt++) {
    await page.waitForTimeout(50);
    pending = (await burrowNodes(page)).find(
      (node) => node.origin.question === "Stop me" && node.status === "pending",
    );
  }
  if (!pending) throw new Error("no pending node");

  await page.request.post(`/api/nodes/${pending.id}/cancel`);
  const events = parseEvents(await (await started).text());
  const done = events.at(-1);
  if (done?.type !== "node.error") throw new Error("expected a terminal event");
  expect(done.node.status).toBe("stopped");
});

test("a long branch keeps every root-to-leaf ancestor in the prompt", async ({ page }) => {
  await signIn(page);
  await connect(page, "model");
  // Each answer names its level, so the transcript is traceable end to end.
  useReply((call) => {
    const ask = call.messages.at(-1)?.content ?? "";
    return {
      content: [`TITLE: Answer ${ask}`, "FOLLOWUPS: What next? | Why?", "", `Marker ${ask}.`].join("\n"),
    };
  });

  let parentId = "node_root";
  const levels = ["level one", "level two", "level three"];
  for (const level of levels) {
    const events = await ask(page, level, parentId);
    const pending = events[0];
    if (pending.type !== "node.pending") throw new Error("no pending event");
    parentId = pending.node.id;
  }

  resetTurns();
  await ask(page, "level four", parentId);

  const transcript = provider.calls.at(-1)?.messages[1]?.content ?? "";
  const needles = ["TCP avoids collapse", ...levels.map((level) => `Marker ${level}.`)];
  const positions = needles.map((needle) => transcript.indexOf(needle));
  expect(positions.every((at) => at >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
  // Siblings never enter the branch transcript.
  expect(transcript).not.toContain("CUBIC's cubic growth");
});

test("the settings sheet verifies a model before saving", async ({ page }) => {
  // A name the seeded provider does not already show, so the wait is real.
  const uiModel = "mock/ui";
  await open(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("model-base-url").fill(baseUrl);
  await page.getByTestId("model-model").fill(uiModel);
  await page.getByTestId("model-api-key").fill(KEY);
  await page.getByTestId("model-save").click();
  await expect(page.getByTestId("model-status")).toContainText(`Verified · ${uiModel}`);

  useReply(() => ({ status: 401, raw: '{"error":{"message":"Invalid API key"}}' }));
  await page.getByTestId("model-base-url").fill(baseUrl);
  await page.getByTestId("model-model").fill(uiModel);
  await page.getByTestId("model-api-key").fill("sk-bad");
  await page.getByTestId("model-save").click();
  await expect(page.getByTestId("model-error")).toContainText("Invalid API key");
  await expect(page.getByTestId("model-status")).toContainText(`Verified · ${uiModel}`);
});
