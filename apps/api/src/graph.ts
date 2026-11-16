import { Annotation, END, START, StateGraph, type LangGraphRunnableConfig } from "@langchain/langgraph";
import { parseHeader } from "../../../packages/types/src/header.ts";
import type { Meta } from "../../../packages/types/src/types.ts";
import type { Model } from "./model.ts";

export type GraphChunk = ({ type: "meta" } & Meta) | { type: "token"; text: string };

const State = Annotation.Root({
  ask: Annotation<string>,
  lineage: Annotation<string>,
  gaps: Annotation<string[]>({ reducer: (_prev, next) => next, default: () => [] }),
  round: Annotation<number>({ reducer: (_prev, next) => next, default: () => 0 }),
  notes: Annotation<string>({ reducer: (prev, next) => prev + next, default: () => "" }),
});

type GraphState = typeof State.State;

const plan = (model: Model) => async (state: GraphState) => {
  const raw = await model.complete("plan", [{ role: "user", content: state.ask }]);
  return { gaps: (JSON.parse(raw) as { gaps: string[] }).gaps, round: 1 };
};

const compose = (model: Model) => async (state: GraphState) => ({
  notes: await model.complete("compose", [
    { role: "user", content: `Lineage:\n${state.lineage}` },
    { role: "user", content: state.ask },
  ]),
});

// Only summarize writes user-visible text. It owns the header split, then hands
// tokens to the caller through the graph writer.
const summarize = (model: Model) => async (state: GraphState, config: LangGraphRunnableConfig) => {
  const raw = await model.complete("summarize", [
    { role: "user", content: `Lineage:\n${state.lineage}\n\nNotes:\n${state.notes}` },
    { role: "user", content: state.ask },
  ]);
  const { meta, body } = parseHeader(raw);
  const write = config.writer as ((chunk: GraphChunk) => void) | undefined;

  write?.({ type: "meta", ...meta });
  for (const text of body.match(/\S+\s*/g) ?? []) write?.({ type: "token", text });
  return {};
};

export function buildGraph(model: Model) {
  return new StateGraph(State)
    .addNode("plan", plan(model))
    .addNode("compose", compose(model))
    .addNode("summarize", summarize(model))
    .addEdge(START, "plan")
    .addEdge("plan", "compose")
    .addEdge("compose", "summarize")
    .addEdge("summarize", END)
    .compile();
}
