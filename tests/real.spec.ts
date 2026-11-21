import { expect, test } from "@playwright/test";
import { parseEvents } from "../packages/types/src/sse.ts";
import { signIn } from "./helpers.ts";

const baseUrl = process.env.REAL_PROVIDER_BASE_URL;
const model = process.env.REAL_PROVIDER_MODEL;
const apiKey = process.env.REAL_PROVIDER_KEY;
const searchBaseUrl = process.env.REAL_SEARCH_BASE_URL;
const searchModel = process.env.REAL_SEARCH_MODEL;
const searchKey = process.env.REAL_SEARCH_KEY;

// Local only: one real round trip, never part of the mocked suite.
test("a real provider answers one ask", async ({ page }) => {
  test.skip(!baseUrl || !model || !apiKey, "Set REAL_PROVIDER_BASE_URL, REAL_PROVIDER_MODEL and REAL_PROVIDER_KEY");
  test.setTimeout(180_000);

  await signIn(page);
  const saved = await page.request.post("/api/settings/model", {
    data: { baseUrl, model, apiKey },
  });
  expect(saved.ok()).toBe(true);

  // Optional: exercise the tool path with a real search provider.
  if (searchBaseUrl && searchModel && searchKey) {
    const savedSearch = await page.request.post("/api/settings/search", {
      data: { baseUrl: searchBaseUrl, model: searchModel, apiKey: searchKey },
    });
    expect(savedSearch.ok()).toBe(true);
  }

  const response = await page.request.post("/api/ask", {
    data: {
      parentId: "node_root",
      origin: { question: "How has QUIC congestion control changed recently?" },
    },
  });
  const events = parseEvents(await response.text());
  expect(events.at(-1)?.type).toBe("node.done");
});
