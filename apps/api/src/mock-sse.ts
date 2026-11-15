import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Event, Source } from "../../../packages/types/src/types.ts";
import { fixtureBurrow } from "../../../packages/types/src/fixtures.ts";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const send = (res: ServerResponse, status: number, body: string, type: string) => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
};

const readJson = async (req: IncomingMessage) => {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || "{}") as { nodeId?: string; ask?: string };
};

const writeEvent = (res: ServerResponse, event: Event) =>
  res.write(`data: ${JSON.stringify(event)}\n\n`);

const SOURCES: Source[] = [
  { title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" },
  { title: "RFC 9002", url: "https://www.rfc-editor.org/rfc/rfc9002" },
];

const titleOf = (ask: string) => {
  const parts = ask.split("\n\n").filter((part) => !part.startsWith("Selected text: "));
  return (parts[parts.length - 1] ?? "Untitled").slice(0, 60);
};

const answerFor = (title: string) =>
  `${title} comes down to how the sender reads congestion signals, then when it backs off. Start with the signal, then the growth rule, then the failure case.`;

const failed = new Set<string>();

export function createMockServer(): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/burrow") {
      send(res, 200, JSON.stringify(fixtureBurrow), "application/json");
      return;
    }

    if (url.pathname === "/ask" && req.method === "POST") {
      const { nodeId: requested, ask = "" } = await readJson(req);
      const nodeId = requested ?? randomUUID();
      const scenario = String(req.headers["x-mock-scenario"] ?? "normal");
      const pace = scenario === "slow" ? 120 : 20;
      const title = titleOf(ask);
      const willFail = scenario === "fail" && !failed.has(nodeId);
      if (willFail) failed.add(nodeId);

      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-store",
        connection: "keep-alive",
      });

      writeEvent(res, { nodeId, type: "node.pending" });
      await delay(scenario === "slow" ? 1000 : pace);
      writeEvent(res, {
        nodeId,
        type: "node.meta",
        title,
        sources: scenario === "empty" ? [] : SOURCES,
        followups: ["Why double per RTT?", "When does CUBIC win?"],
      });

      const tokens = answerFor(title).match(/\S+\s*/g) ?? [];
      for (const [index, text] of tokens.entries()) {
        if (willFail && index === 3) {
          writeEvent(res, { nodeId, type: "node.error", reason: "Model timed out" });
          res.end();
          return;
        }
        writeEvent(res, { nodeId, type: "node.token", text });
        await delay(pace);
      }

      writeEvent(res, { nodeId, type: "node.done" });
      res.end();
      return;
    }

    send(res, 404, "not found", "text/plain");
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createMockServer().listen(port, () => {
    console.log(`mock sse on http://localhost:${port}`);
  });
}
