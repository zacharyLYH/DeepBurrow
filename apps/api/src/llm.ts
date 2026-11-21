import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ProviderConfig = { baseUrl: string; model: string; apiKey: string };
export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};
export type ChatReply = { content: string; toolCalls: ToolCall[] };
export type ChatOptions = {
  sessionId?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: boolean;
  tools?: ToolSpec[];
};

// The agent's only view of a model; the HTTP adapter below satisfies it.
export type Model = (
  messages: ChatMessage[],
  options?: Pick<ChatOptions, "sessionId" | "signal" | "tools">,
) => Promise<ChatReply>;

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 30_000);
const TRANSIENT = new Set([408, 409, 429, 500, 502, 503, 504]);
const PRIVATE = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|f[cd]|fe80)/i;

const isAbort = (error: unknown) =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

// User-supplied endpoints must not reach this machine or a private network.
export async function safeEndpoint(raw: string) {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Endpoint must be http(s)");
  // The loopback escape hatch is for local development and tests only.
  if (process.env.ALLOW_PRIVATE_PROVIDERS === "1") return url;
  if (url.protocol !== "https:") throw new Error("Endpoint must use https");
  const hosts = isIP(url.hostname)
    ? [url.hostname]
    : (await lookup(url.hostname, { all: true })).map((item) => item.address);
  if (hosts.length === 0 || hosts.some((host) => PRIVATE.test(host))) {
    throw new Error("Endpoint resolves to a private address");
  }
  return url;
}

const messageOf = (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as {
      choices?: { message?: { content?: unknown; tool_calls?: unknown } }[];
    };
    const message = parsed.choices?.[0]?.message;
    if (message) return message;
  } catch {
    // Falls through to the shape error.
  }
  throw new Error(`Unexpected provider response: ${raw.trim().slice(0, 300)}`);
};

const toolCallsOf = (value: unknown): ToolCall[] =>
  Array.isArray(value)
    ? value.flatMap((raw) => {
        const call = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
        if (
          typeof call?.id !== "string" ||
          typeof call.function?.name !== "string" ||
          typeof call.function.arguments !== "string"
        ) {
          return [];
        }
        return [
          {
            id: call.id,
            // Providers require the echoed call to keep its type.
            type: "function" as const,
            function: { name: call.function.name, arguments: call.function.arguments },
          },
        ];
      })
    : [];

// One POST path for chat and search: the caller owns the payload and shapes the
// response; search passes its body through untouched.
export async function postToProvider(
  config: ProviderConfig,
  payload: Record<string, unknown>,
  options: Pick<ChatOptions, "sessionId" | "signal" | "timeoutMs" | "retry"> = {},
) {
  const base = await safeEndpoint(config.baseUrl);
  const target = new URL(`${base.href.replace(/\/+$/, "")}/chat/completions`);
  const timeout = options.timeoutMs ?? TIMEOUT_MS;
  const body = JSON.stringify(payload);

  // One retry for transient failures; bad credentials and bad requests surface.
  for (let attempt = 0; ; attempt++) {
    const canRetry = attempt === 0 && options.retry !== false && !options.signal?.aborted;
    // Fresh per attempt: one timed-out try must not poison its retry.
    const signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout);

    let response: Response;
    try {
      response = await fetch(target, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
          ...(options.sessionId ? { "x-session-id": options.sessionId } : {}),
        },
        body,
        signal,
        redirect: "error",
      });
    } catch (error) {
      if (canRetry && !isAbort(error)) continue;
      throw isAbort(error) ? new Error("Model timed out") : error;
    }

    const text = await response.text();
    if (!response.ok) {
      if (canRetry && TRANSIENT.has(response.status)) continue;
      throw new Error(text.trim() || `HTTP ${response.status}`);
    }
    return text;
  }
}

export async function chatCompletion(
  config: ProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
) {
  const raw = await postToProvider(
    config,
    {
      model: config.model,
      messages,
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
      ...(options.tools?.length ? { tools: options.tools } : {}),
    },
    options,
  );
  const message = messageOf(raw);
  const content = typeof message.content === "string" ? message.content : "";
  const toolCalls = toolCallsOf(message.tool_calls);
  if (!content.trim() && toolCalls.length === 0) {
    throw new Error("Empty response from the provider");
  }
  return { content, toolCalls } satisfies ChatReply;
}
