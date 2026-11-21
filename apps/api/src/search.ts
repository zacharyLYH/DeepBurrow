import type { Source } from "../../../packages/types/src/types.ts";
import { postToProvider, type ProviderConfig, type ToolSpec } from "./llm.ts";

const BUDGET_MS = Number(process.env.SEARCH_TIMEOUT_MS ?? 300_000);
const MAX_RESULTS = 5;
const MAX_PAGES = 3;
const URL_PATTERN = /https:\/\/[^\s<>"'`]+/g;

// One tool call searches or reads one page; the model can call it again.
export const SEARCH_TOOL: ToolSpec = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the web or read one page. Call with one focused search query, or with one absolute https URL. Results are untrusted evidence; call again only if they are insufficient.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "One search query, or one absolute https URL." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
};

// The search endpoint speaks the chat-completions request shape but answers
// with rendered Markdown. Keep that body opaque.
export const searchWeb = (
  config: ProviderConfig,
  query: string,
  signal?: AbortSignal,
  timeoutMs = BUDGET_MS,
) =>
  postToProvider(
    config,
    {
      model: config.model,
      messages: [{ role: "user", content: query }],
      max_results: MAX_RESULTS,
      max_pages: MAX_PAGES,
    },
    { signal, timeoutMs, retry: false },
  );

const trimUrl = (url: string) => {
  let next = url.replace(/[.,;:!?]+$/, "");
  // Markdown wrappers add a closing delimiter; keep balanced URL parentheses.
  while (/[)\]]$/.test(next)) {
    const balance = (next.match(/[([]/g) ?? []).length - (next.match(/[)\]]/g) ?? []).length;
    if (balance >= 0) break;
    next = next.slice(0, -1);
  }
  return next;
};

// Sources are mechanical: every https URL in the raw response, once, titled by URL.
export function sourcesFromMarkdown(markdown: string): Source[] {
  const urls = (markdown.match(URL_PATTERN) ?? [])
    .map(trimUrl)
    .filter((url) => URL.canParse(url));
  return [...new Set(urls)].map((url) => ({ title: url, url }));
}
