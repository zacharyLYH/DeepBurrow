import { Hono } from "hono";
import type { AuthContext, AuthEnv } from "../auth.ts";
import {
  readModelConfig,
  readSearchConfig,
  readSettings,
  writeModelConfig,
  writeSearchConfig,
  writeSettings,
} from "../db.ts";
import type { ProviderSummary, UserSettings } from "../../../../packages/types/src/types.ts";
import { chatCompletion, type ProviderConfig } from "../llm.ts";
import { searchWeb } from "../search.ts";

export const settingsRoutes = new Hono<AuthEnv>();

const providerSummary = (config: ProviderConfig | null): ProviderSummary => ({
  configured: Boolean(config),
  baseUrl: config?.baseUrl ?? "",
  model: config?.model ?? "",
});

// A blank key keeps the stored one, so editing a URL need not resend secrets.
const providerConfig = (body: unknown, stored: ProviderConfig | null): ProviderConfig | null => {
  const input = (body ?? {}) as Record<string, unknown>;
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const config = {
    baseUrl: text(input.baseUrl).replace(/\/chat\/completions\/?$/, "").replace(/\/+$/, ""),
    model: text(input.model),
    apiKey: text(input.apiKey) || stored?.apiKey || "",
  };
  return config.baseUrl && config.model && config.apiKey ? config : null;
};

// A small request proves the endpoint and key; the answer shape does not matter.
const verifyProvider = async (kind: "model" | "search", config: ProviderConfig) => {
  if (kind === "search") {
    const raw = await searchWeb(config, "verification", undefined, 30_000);
    if (!raw.trim()) throw new Error("Empty response from the provider");
    return;
  }
  const reply = await chatCompletion(
    config,
    [{ role: "user", content: "Reply with the single word: ready" }],
    { timeoutMs: 30_000 },
  );
  if (!reply.content.trim()) throw new Error("Empty response from the provider");
};

const saveProvider = (kind: "model" | "search") => async (c: AuthContext) => {
  const userId = c.get("userId");
  const stored = kind === "model" ? readModelConfig(userId) : readSearchConfig(userId);
  const config = providerConfig(await c.req.json().catch(() => null), stored);
  if (!config) return c.json({ error: "baseUrl, model and apiKey are required" }, 400);

  try {
    await verifyProvider(kind, config);
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Could not verify the endpoint" },
      400,
    );
  }

  (kind === "model" ? writeModelConfig : writeSearchConfig)(userId, config);
  return c.json({ provider: providerSummary(config) });
};

settingsRoutes.get("/", (c) => {
  const userId = c.get("userId");
  return c.json({
    settings: readSettings(userId),
    model: providerSummary(readModelConfig(userId)),
    search: providerSummary(readSearchConfig(userId)),
  });
});

settingsRoutes.post("/model", saveProvider("model"));
settingsRoutes.post("/search", saveProvider("search"));

settingsRoutes.patch("/", async (c) => {
  const patch = await c.req.json<Partial<UserSettings>>().catch(() => null);
  if (!patch) return c.json({ error: "settings required" }, 400);
  return c.json({ settings: writeSettings(c.get("userId"), patch) });
});
