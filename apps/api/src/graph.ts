import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { parseHeader } from "../../../packages/types/src/header.ts";
import type { Meta } from "../../../packages/types/src/types.ts";
import type { Model } from "./model.ts";

export type GraphChunk =
  | ({ type: "meta" } & Meta)
  | { type: "progress"; line: string }
  | { type: "token"; text: string };

const MAX_ROUNDS = 3;

const State = Annotation.Root({
  nodeId: Annotation<string>,
  ask: Annotation<string>,
  lineage: Annotation<string>,
  suggestedQuestions: Annotation<string[]>({ reducer: (_prev, next) => next, default: () => [] }),
  openQuestion: Annotation<string>({ reducer: (_prev, next) => next, default: () => "" }),
  round: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  done: Annotation<boolean>({ reducer: (_prev, next) => next, default: () => false }),
  notes: Annotation<string>({ reducer: (prev, next) => prev + next, default: () => "" }),
});

type GraphState = typeof State.State;

const writeTo = (config: LangGraphRunnableConfig) =>
  config.writer as ((chunk: GraphChunk) => void) | undefined;

const progress = (config: LangGraphRunnableConfig, line: string) =>
  writeTo(config)?.({ type: "progress", line });

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringList = (value: unknown) => {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("bad questions JSON");
  }
  return value as string[];
};

const parseJson = (raw: string, error: string) => {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(error);
  }
};

const parsePlan = (raw: string) => {
  const parsed = parseJson(raw, "bad plan JSON");
  if (!isObj(parsed)) throw new Error("bad plan JSON");
  return stringList(parsed.suggestedQuestions);
};

const parseVerdict = (raw: string) => {
  const parsed = parseJson(raw, "bad verdict JSON");
  if (!isObj(parsed) || typeof parsed.done !== "boolean") throw new Error("bad verdict JSON");
  return { done: parsed.done, suggestedQuestions: stringList(parsed.suggestedQuestions) };
};

const plan = (model: Model) => async (state: GraphState, config: LangGraphRunnableConfig) => {
  progress(config, "Planning the research…");
  const raw = await model.complete("plan", [{ role: "user", content: state.ask }]);
  return {
    suggestedQuestions: parsePlan(raw),
    round: 1,
  };
};

const compose = (model: Model) => async (state: GraphState, config: LangGraphRunnableConfig) => {
  const openQuestion = state.suggestedQuestions[0] ?? state.ask;
  progress(config, openQuestion);
  const raw = await model.complete(
    "compose",
    [
      { role: "user", content: `Lineage:\n${state.lineage}\n\nNotes:\n${state.notes}` },
      { role: "user", content: openQuestion },
    ],
    state.round,
  );
  return {
    notes: raw,
    openQuestion,
    suggestedQuestions: state.suggestedQuestions.slice(1),
  };
};

const judge = (model: Model) => async (state: GraphState, config: LangGraphRunnableConfig) => {
  progress(config, "Checking what's still open…");
  const raw = await model.complete(
    "judge",
    [
      { role: "user", content: `Notes:\n${state.notes}` },
      { role: "user", content: state.ask },
    ],
    state.round,
  );
  const verdict = parseVerdict(raw);
  if (verdict.done) progress(config, "Enough gathered.");

  return {
    done: verdict.done,
    suggestedQuestions: [...state.suggestedQuestions, ...verdict.suggestedQuestions],
    round: state.round + 1,
  };
};

// Only summarize writes user-visible text. It owns the header split, then hands
// tokens to the caller through the graph writer.
const summarize = (model: Model) => async (state: GraphState, config: LangGraphRunnableConfig) => {
  progress(config, "Writing the answer…");
  const raw = await model.complete("summarize", [
    { role: "user", content: `Lineage:\n${state.lineage}\n\nNotes:\n${state.notes}` },
    { role: "user", content: state.ask },
  ]);
  const { meta, body } = parseHeader(raw);

  writeTo(config)?.({ type: "meta", ...meta });
  for (const text of body.match(/\S+\s*/g) ?? []) writeTo(config)?.({ type: "token", text });
  return {};
};

export function buildGraph(model: Model) {
  // Stops live on the edge, not in a while: a done verdict or the round cap.
  const route = (state: GraphState) =>
    state.done || state.round > MAX_ROUNDS ? ("summarize" as const) : ("compose" as const);

  return new StateGraph(State)
    .addNode("plan", plan(model))
    .addNode("compose", compose(model))
    .addNode("judge", judge(model))
    .addNode("summarize", summarize(model))
    .addEdge(START, "plan")
    .addEdge("plan", "compose")
    .addEdge("compose", "judge")
    .addConditionalEdges("judge", route, { compose: "compose", summarize: "summarize" })
    .addEdge("summarize", END)
    .compile();
}
