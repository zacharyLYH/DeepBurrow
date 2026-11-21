import { createServer } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { titleFromAsk } from "../packages/types/src/header.ts";

export type MockToolCall = { id: string; function: { name: string; arguments: string } };
export type MockMessage = {
  role: string;
  content: string;
  tool_calls?: MockToolCall[];
  tool_call_id?: string;
};
export type MockCall = {
  messages: MockMessage[];
  bodySession?: string;
  session?: string;
  authorization?: string;
  tools?: { function?: { name?: string } }[];
  maxResults?: number;
};
export type MockResult = {
  status?: number;
  content?: string;
  raw?: string;
  delay?: number;
  toolCalls?: MockToolCall[];
};
export type MockReply = (call: MockCall) => MockResult;

export type MockProvider = {
  url: string;
  calls: MockCall[];
  reset: () => void;
  setReply: (reply?: MockReply) => void;
  close: () => Promise<void>;
};

export const MOCK_PROVIDER_PORT = 9393;
export const MOCK_PROVIDER_URL = `http://127.0.0.1:${MOCK_PROVIDER_PORT}/v1`;
export const MOCK_API_KEY = "test-key";

const SOURCES = [
  { title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" },
  { title: "RFC 9002", url: "https://www.rfc-editor.org/rfc/rfc9002" },
];

const RICH_BODY = [
  "## Signals",
  "",
  "Congestion shows up three ways:",
  "",
  "- loss",
  "- delay",
  "- explicit marks",
  "",
  "| signal | cost |",
  "| --- | --- |",
  "| loss | late |",
  "| delay | noisy |",
  "",
  "- [x] probe the pipe",
  "- [ ] back off",
  "",
  "~~dropped~~ and `inline code` and [a link](https://example.com/read).",
  "",
  "```js",
  "const window = min(cwnd, rwnd);",
  "```",
  "",
  "Inline math $a^2 + b^2 = c^2$ and a block:",
  "",
  "$$",
  "\\int_0^1 x^2 dx = \\frac{1}{3}",
  "$$",
  "",
  "```mermaid",
  "graph TD",
  "  A[probe] --> B[grow]",
  "  B --> C[loss]",
  "```",
  "",
  "![diagram](/diagram.svg)",
  "",
  "<script>alert('xss')</script>",
].join("\n");

const header = (title: string) => [
  `TITLE: ${title}`,
  `SOURCES: ${SOURCES.map((source) => `${source.title} — ${source.url}`).join(" | ")}`,
];

const lastUserText = (messages: MockMessage[]) =>
  messages.filter((message) => message.role === "user").at(-1)?.content ?? "";

const answerFor = (ask: string) => {
  const title = titleFromAsk(ask) || "Untitled";
  if (ask.includes("zzempty")) return [...header(title), ""].join("\n");
  if (ask.includes("zzmd")) {
    return [...header(title), "FOLLOWUPS: Why probe? | When back off?", "", RICH_BODY].join("\n");
  }
  return [
    ...header(title),
    "FOLLOWUPS: Why double per RTT? | When does CUBIC win?",
    "",
    `${title} comes down to how the sender reads congestion signals, then when it backs off. Start with the signal, then the growth rule, then the failure case.`,
  ].join("\n");
};

// One tool call, shared by the default reply and specs that script it.
export const toolCallReply = (query: string): MockResult => ({
  content: "",
  toolCalls: [
    { id: "call_search", function: { name: "web_search", arguments: JSON.stringify({ query }) } },
  ],
});

// Scripted entirely from the request, like a model reading the ask. Markers are
// test-only; the browser never sends them.
const defaultReply = (latencyMs: number): MockReply => {
  const failedOnce = new Set<string>();
  return (call) => {
    const ask = lastUserText(call.messages);
    if (ask === "Reply with the single word: ready") return { content: "ready" };
    // A mock answer cannot be repaired; headers-only keeps the empty-body path real.
    if (ask.startsWith("Revise the previous response")) return { content: "TITLE:\n\n" };
    if (call.maxResults !== undefined) return { content: "Search results were unavailable." };
    if (ask.includes("zztimeout")) return { delay: 5000 };

    const latency = ask.includes("zzslow") ? 1500 : latencyMs;
    if (ask.includes("zzfail") && !failedOnce.has(ask)) {
      failedOnce.add(ask);
      // 400 is not retried automatically, so the card fails once for real.
      return { status: 400, raw: "Model timed out", delay: latency };
    }
    const canSearch = call.tools?.some((tool) => tool.function?.name === "web_search");
    if (canSearch && !call.messages.some((message) => message.role === "tool")) {
      return toolCallReply(ask);
    }
    return { content: answerFor(ask), delay: latency };
  };
};

const readBody = (request: import("node:http").IncomingMessage) =>
  new Promise<string>((resolve) => {
    let raw = "";
    request.on("data", (chunk) => (raw += chunk));
    request.on("end", () => resolve(raw));
  });

export async function startMockProvider(
  options: { port?: number; latencyMs?: number } = {},
): Promise<MockProvider> {
  const latency = options.latencyMs ?? Number(process.env.MOCK_LATENCY_MS ?? 500);
  const calls: MockCall[] = [];
  const sockets = new Set<Socket>();
  let reply = defaultReply(latency);

  const server = createServer(async (request, response) => {
    if (request.url === "/health") {
      response.writeHead(200).end("ok");
      return;
    }
    const body = JSON.parse(await readBody(request)) as {
      messages: MockMessage[];
      session_id?: string;
      tools?: MockCall["tools"];
      max_results?: number;
    };
    const call: MockCall = {
      messages: body.messages,
      bodySession: body.session_id,
      session: request.headers["x-session-id"] as string | undefined,
      authorization: request.headers.authorization,
      tools: body.tools,
      maxResults: body.max_results,
    };
    calls.push(call);

    const result = reply(call);
    if (result.delay) await new Promise((done) => setTimeout(done, result.delay));
    if (response.destroyed || response.writableEnded) return;
    // Search answers with rendered content; only chat calls use the choices envelope.
    const search = body.max_results !== undefined;
    response.writeHead(result.status ?? 200, {
      "content-type": search ? "text/markdown; charset=utf-8" : "application/json",
    });
    response.end(
      result.status && result.status >= 400
        ? result.raw ?? ""
        : search
          ? result.content ?? ""
          : JSON.stringify({
              choices: [
                {
                  message: {
                    content: result.content ?? "",
                    ...(result.toolCalls
                      ? { tool_calls: result.toolCalls.map((call) => ({ type: "function", ...call })) }
                      : {}),
                  },
                },
              ],
            }),
    );
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/v1`,
    calls,
    reset: () => {
      calls.length = 0;
    },
    setReply: (next) => {
      reply = next ?? defaultReply(latency);
    },
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}
