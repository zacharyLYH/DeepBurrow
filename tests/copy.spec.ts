import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { card, menu, open, rootId } from "./helpers.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.beforeEach(() => resetDemoBurrow());

const clipboard = (page: import("@playwright/test").Page) =>
  page.evaluate(() => navigator.clipboard.readText());

test("copy card from the menu is raw Markdown", async ({ page }) => {
  await open(page);
  await menu(page, rootId);
  await page.getByTestId(`copy-${rootId}`).click();

  const text = await clipboard(page);
  expect(text.startsWith("## TCP congestion control")).toBe(true);
  expect(text).toContain("> How does TCP congestion control work?");
  expect(text).toContain("RFC 5681");
  await expect(card(page, rootId)).toBeVisible();
});
