import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { titleFromAsk } from "../../../packages/types/src/header.ts";
import type { Meta, Source } from "../../../packages/types/src/types.ts";
import type { ChatMessage, ChatReply, Model, ToolCall, ToolSpec } from "./llm.ts";
import { REPAIR_PROMPT, SYSTEM_PROMPT } from "./prompts.ts";
import { SEARCH_TOOL, sourcesFromMarkdown } from "./search.ts";
import { validateAnswer } from "./validate.ts";

export type GraphChunk =
  | ({ type: "meta" } & Meta)
  | { type: "progress"; line: string }
  | { type: "token"; text: string };

export type AgentProviders = {
  model: Model;
  // One call searches or reads one page; the tool can be invoked again.
  search?: (query: string, signal?: AbortSignal) => Promise<string>;
};

const MAX_REPAIRS = 2;
const MAX_SEARCH_ROUNDS = 3;

// Every channel replaces its value; defaults make extra state optional.
const replace = <T>(defaultValue: () => T) => ({
  reducer: (_prev: T, value: T) => value,
  default: defaultValue,
});

const State = Annotation.Root({
  ask: Annotation<string>,
  lineage: Annotation<string>,
  sessionId: Annotation<string>,
  // Conversation nodes return only their new turns; the reducer appends.
  messages: Annotation<ChatMessage[]>({
    reducer: (previous, next) => [...previous, ...next],
    default: () => [],
  }),
  rounds: Annotation<number>(replace<number>(() => 0)),
  sources: Annotation<Source[]>(replace<Source[]>(() => [])),
  answer: Annotation<string>(replace<string>(() => "")),
  meta: Annotation<Meta>(replace<Meta>(() => ({ title: "", sources: [], followups: [] }))),
  body: Annotation<string>(replace<string>(() => "")),
  errors: Annotation<string[]>(replace<string[]>(() => [])),
  repairs: Annotation<number>(replace<number>(() => 0)),
});

type GraphState = typeof State.State;

const emit = (config: LangGraphRunnableConfig, chunk: GraphChunk) =>
  (config.writer as ((chunk: GraphChunk) => void) | undefined)?.(chunk);

const progress = (config: LangGraphRunnableConfig, line: string) =>
  emit(config, { type: "progress", line });

const complete = (
  providers: AgentProviders,
  messages: ChatMessage[],
  state: GraphState,
  config: LangGraphRunnableConfig,
  tools?: ToolSpec[],
) =>
  providers.model(messages, {
    sessionId: state.sessionId,
    signal: config.signal,
    ...(tools ? { tools } : {}),
  });

// System prompt, root→node transcript, then the ask. Search results join the
// conversation as tool messages.
const withContext = (state: GraphState): ChatMessage[] => [
  { role: "system", content: SYSTEM_PROMPT },
  ...(state.lineage.trim() ? [{ role: "user" as const, content: state.lineage }] : []),
  { role: "user", content: state.ask },
];

// A tool request is the last assistant turn, not a second copy in state.
const pendingToolCalls = (state: GraphState) => state.messages.at(-1)?.tool_calls ?? [];

const queryOf = (call: ToolCall) => {
  try {
    const { query } = JSON.parse(call.function.arguments) as { query?: unknown };
    return typeof query === "string" ? query.trim() : "";
  } catch {
    return "";
  }
};

const generateAnswer = (providers: AgentProviders) => async (
  state: GraphState,
  config: LangGraphRunnableConfig,
) => {
  progress(config, "Writing the answer…");
  // The first call seeds the conversation; later calls carry the tool history.
  const messages = state.messages.length ? state.messages : withContext(state);
  // The tool is on the first call and each round until the budget is spent.
  const tools = providers.search && state.rounds < MAX_SEARCH_ROUNDS ? [SEARCH_TOOL] : undefined;
  const reply: ChatReply = await complete(providers, messages, state, config, tools);
  // Seed the transcript once, then append only this assistant turn. A final
  // answer still lives in `answer`; only tool calls need to stay in history.
  return {
    answer: reply.content,
    messages: [
      ...(state.messages.length ? [] : withContext(state)),
      ...(reply.toolCalls.length
        ? [
            {
              role: "assistant" as const,
              content: reply.content,
              tool_calls: reply.toolCalls,
            },
          ]
        : []),
    ],
  };
};

const webSearch = (providers: AgentProviders) => async (
  state: GraphState,
  config: LangGraphRunnableConfig,
) => {
  progress(config, "Searching the web…");
  const sources = new Map(state.sources.map((source) => [source.url, source]));
  const results: ChatMessage[] = [];

  const searchOne = async (call: ToolCall) => {
    const query = queryOf(call);
    if (!query) return "Search failed: the query was empty.";
    try {
      const raw = await providers.search!(query, config.signal);
      if (!raw.trim()) return "No search results.";
      for (const source of sourcesFromMarkdown(raw)) sources.set(source.url, source);
      return raw;
    } catch (error) {
      // A cancelled run must still propagate its abort.
      if (config.signal?.aborted) throw error;
      progress(config, "Search failed; continuing.");
      return "Search failed.";
    }
  };

  // Tool calls from one turn run sequentially, one request each.
  for (const call of pendingToolCalls(state)) {
    results.push({ role: "tool", tool_call_id: call.id, content: await searchOne(call) });
  }

  return { messages: results, sources: [...sources.values()], rounds: state.rounds + 1 };
};

const validate = () => async (state: GraphState) => {
  const next = await validateAnswer(
    state.answer,
    new Set(state.sources.map((source) => source.url)),
  );
  // Repairs may return nothing. Keep the last header and any usable body, so a
  // failed node still shows what it knew and the original can still answer.
  return {
    ...next,
    meta: {
      title: next.meta.title || state.meta.title,
      sources: next.meta.sources.length ? next.meta.sources : state.meta.sources,
      followups: next.meta.followups.length ? next.meta.followups : state.meta.followups,
    },
    body: next.body.trim() ? next.body : state.body,
  };
};

const repairAnswer = (providers: AgentProviders) => async (
  state: GraphState,
  config: LangGraphRunnableConfig,
) => {
  progress(config, "Fixing the answer…");
  const prompt = REPAIR_PROMPT.replace("{{response}}", state.answer).replace(
    "{{errors}}",
    state.errors.join("\n"),
  );
  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: prompt },
  ];
  const reply = await complete(providers, messages, state, config);
  return { answer: reply.content, repairs: state.repairs + 1 };
};

const streamAnswer = (providers: AgentProviders) => (state: GraphState, config: LangGraphRunnableConfig) => {
  emit(config, {
    type: "meta",
    title: state.meta.title.trim() || titleFromAsk(state.ask),
    sources: providers.search ? state.sources : state.meta.sources,
    followups: state.meta.followups,
  });
  // A body is the only streamable output; headers alone are a failed run.
  if (!state.body.trim()) throw new Error("Empty answer");
  for (const text of state.body.match(/\S+\s*/g) ?? []) emit(config, { type: "token", text });
  return {};
};

export function buildGraph(providers: AgentProviders) {
  const afterGenerate =
    (state: GraphState) =>
      providers.search && pendingToolCalls(state).length > 0 && state.rounds < MAX_SEARCH_ROUNDS
        ? "search"
        : "validate";
  const afterValidate = (state: GraphState) =>
    state.errors.length === 0 || state.repairs >= MAX_REPAIRS ? "stream" : "repair";

  return new StateGraph(State)
    .addNode("generate", generateAnswer(providers))
    .addNode("search", webSearch(providers))
    .addNode("validate", validate())
    .addNode("repair", repairAnswer(providers))
    .addNode("stream", streamAnswer(providers))
    .addEdge(START, "generate")
    .addConditionalEdges("generate", afterGenerate, { search: "search", validate: "validate" })
    .addEdge("search", "generate")
    .addConditionalEdges("validate", afterValidate, { repair: "repair", stream: "stream" })
    .addEdge("repair", "validate")
    .addEdge("stream", END)
    .compile();
}
