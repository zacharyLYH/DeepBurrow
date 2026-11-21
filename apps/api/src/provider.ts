import { readModelConfig, readSearchConfig } from "./db.ts";
import type { AgentProviders } from "./graph.ts";
import { chatCompletion } from "./llm.ts";
import { searchWeb } from "./search.ts";

export function agentProviders(userId: string): AgentProviders {
  const config = readModelConfig(userId);
  if (!config) throw new Error("Model not configured. Add one in Settings.");
  const search = readSearchConfig(userId);
  return {
    model: (messages, options) => chatCompletion(config, messages, options),
    search: search ? (query, signal) => searchWeb(search, query, signal) : undefined,
  };
}
