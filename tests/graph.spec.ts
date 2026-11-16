import { expect, test } from "@playwright/test";
import { buildGraph, type GraphChunk } from "../apps/api/src/graph.ts";
import { fakeModel, type FakeOptions, type Model } from "../apps/api/src/model.ts";

async function collect(graph: ReturnType<typeof buildGraph>) {
  const chunks: GraphChunk[] = [];
  const events = await graph.stream(
    { nodeId: "node_test", ask: "How does TCP congestion control work?", lineage: "" },
    { streamMode: "custom" },
  );
  for await (const chunk of events) chunks.push(chunk as GraphChunk);
  return chunks;
}

async function run(options: FakeOptions) {
  const scripted = fakeModel(options);
  const counts: Record<string, number> = {};
  const model: Model = {
    complete(task, messages, round) {
      counts[task] = (counts[task] ?? 0) + 1;
      return scripted.complete(task, messages, round);
    },
  };
  const chunks = await collect(buildGraph(model));
  return {
    counts,
    chunks,
    progress: chunks.flatMap((chunk) => (chunk.type === "progress" ? [chunk.line] : [])),
  };
}

test("a done verdict ends after one round and streams progress before meta", async () => {
  const { counts, chunks, progress } = await run({ rounds: 1 });

  expect(counts).toEqual({ plan: 1, compose: 1, judge: 1, summarize: 1 });
  expect(progress[0]).toBe("Planning the research…");
  expect(progress).toContain("Why double per RTT?");
  expect(progress.at(-1)).toBe("Writing the answer…");

  // Rounds belong in the log; the pending card shows work, not bookkeeping.
  expect(progress.join("\n")).not.toMatch(/Round \d/);

  const metaAt = chunks.findIndex((chunk) => chunk.type === "meta");
  const progressAt = chunks.findIndex((chunk) => chunk.type === "progress");
  expect(progressAt).toBeLessThan(metaAt);
  expect(chunks.some((chunk) => chunk.type === "token")).toBe(true);
});

test("the round cap stops the loop at three rounds", async () => {
  const { counts, progress } = await run({ rounds: 99 });

  expect(counts).toEqual({ plan: 1, compose: 3, judge: 3, summarize: 1 });
  expect(progress.filter((line) => line === "Checking what's still open…")).toHaveLength(3);
  expect(progress).toContain("What is still open after round 1?");
});

test("a done verdict overrides a longer script", async () => {
  const { counts } = await run({ rounds: 99, verdict: "done" });

  expect(counts).toEqual({ plan: 1, compose: 1, judge: 1, summarize: 1 });
});

test("bad verdict JSON fails the run instead of looping", async () => {
  const scripted = fakeModel({ rounds: 99 });
  const model: Model = {
    complete: (task, messages, round) =>
      task === "judge" ? Promise.resolve("not json") : scripted.complete(task, messages, round),
  };

  await expect(collect(buildGraph(model))).rejects.toThrow("bad verdict JSON");
});
