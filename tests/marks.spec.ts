import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { cards, open, rootId, selectPassage } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

test("selecting text opens the popover and the child keeps the reference", async ({ page }) => {
  await open(page);
  const passage = await selectPassage(page, rootId);
  await expect(page.getByTestId("ask-popover")).toBeVisible();

  // Digit 1 fires the first selection preset without typing.
  await page.keyboard.press("1");
  await expect(cards(page)).toHaveCount(5);

  const child = cards(page).last();
  const childId = (await child.getAttribute("data-testid"))!.replace("card-", "");
  await expect(child.getByTestId(`reference-${childId}`)).toContainText(passage);
  await expect(child.getByTestId(`origin-${childId}`)).toHaveText("Explain");
  await expect(page.getByTestId(`card-${rootId}`).locator("mark")).toHaveCount(0);

  // The child row carries the passage, so it survives reload.
  await page.waitForTimeout(400);
  await page.reload();
  await open(page, 5);
  await expect(page.getByTestId(`reference-${childId}`)).toContainText(passage);
});

test("the question travels with the selection", async ({ page }) => {
  await open(page);
  await selectPassage(page, rootId, 30);
  await page.getByTestId("ask-input").fill("What does probing buy us?");
  await page.getByTestId("ask-submit").click();

  await expect(cards(page)).toHaveCount(5);
  const child = cards(page).last();
  const childId = (await child.getAttribute("data-testid"))!.replace("card-", "");
  await expect(child.getByTestId(`origin-${childId}`)).toHaveText("What does probing buy us?");

  const { nodes } = (await (await page.request.get("/api/burrows/demo")).json()) as {
    nodes: { id: string; origin: { selectedText?: string } }[];
  };
  const created = nodes.find((node) => node.id === childId);
  expect(created?.origin.selectedText?.length).toBe(30);
});

test("the popover uses the selection preset set and Esc closes it", async ({ page }) => {
  await open(page);
  await selectPassage(page, rootId, 40);

  const popover = page.getByTestId("ask-popover");
  await expect(popover).toBeVisible();
  await expect(page.getByTestId("ask-preset-0")).toContainText("1 Explain");
  await expect(page.getByTestId("ask-preset-2")).toContainText("3 Go deeper");

  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);
  await expect(cards(page)).toHaveCount(4);
});
