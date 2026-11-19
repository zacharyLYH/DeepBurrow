import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { cards, menu, open, rootId } from "./helpers.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.beforeEach(() => resetDemoBurrow());

const bodyFont = (page: import("@playwright/test").Page, id = rootId) =>
  page.getByTestId(`body-${id}`).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

test("copy as Markdown puts the raw card on the clipboard", async ({ page }) => {
  await open(page);
  await menu(page, rootId);
  await page.getByTestId(`copy-${rootId}`).click();

  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("## TCP congestion control");
  expect(text).toContain("TCP avoids collapse by probing");
  expect(text).toContain("Sources");
});

test("text size is per card and resets", async ({ page }) => {
  await open(page);
  const before = await bodyFont(page);

  await menu(page, rootId);
  await page.getByTestId(`font-up-${rootId}`).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => bodyFont(page)).toBeGreaterThan(before);

  await menu(page, rootId);
  await page.getByTestId(`font-reset-${rootId}`).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => bodyFont(page)).toBeCloseTo(before, 1);

  // The next card keeps its own size.
  expect(await bodyFont(page, "node_why")).toBeCloseTo(before, 1);
});

test("the menu has no collapse actions", async ({ page }) => {
  await open(page);
  await menu(page, rootId);
  await expect(page.getByTestId(`menu-panel-${rootId}`)).toBeVisible();
  await expect(page.locator('[data-testid^="collapse-"]')).toHaveCount(0);
});
