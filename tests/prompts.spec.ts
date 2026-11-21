import { expect, test } from "@playwright/test";
import { fixtureNodes } from "../packages/types/src/fixtures.ts";
import { resetDemoBurrow } from "./db.ts";
import { ask, cards, open, rootId, selectPassage } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

const idOf = async (target: import("@playwright/test").Locator) =>
  (await target.getAttribute("data-testid"))!.replace("card-", "");

test("root and child cards quote their question above the answer", async ({ page }) => {
  await open(page);
  const root = page.getByTestId(`card-${rootId}`);
  await expect(root.getByTestId(`prompt-${rootId}`)).toContainText(
    "How does TCP congestion control work?",
  );
  await expect(root.getByTestId(`prompt-${rootId}`)).toHaveClass(/db-origin-prompt/);

  const child = await ask(page, "Why does slow start double?");
  await expect(child).toHaveAttribute("data-status", "answered", { timeout: 15000 });
  const childId = await idOf(child);
  await expect(child.getByTestId(`prompt-${childId}`)).toContainText("Why does slow start double?");
});

test("a preset label is the prompt and the selected passage stays separate", async ({ page }) => {
  await open(page);
  const passage = await selectPassage(page, rootId);
  await page.getByTestId("ask-preset-0").click();

  await expect(cards(page)).toHaveCount(fixtureNodes.length + 1);
  const child = cards(page).last();
  const childId = await idOf(child);

  const prompt = child.getByTestId(`prompt-${childId}`);
  await expect(prompt).toHaveText("Explain");
  const reference = child.getByTestId(`reference-${childId}`);
  await expect(reference).toContainText(passage);
  // Two blocks, not one: the passage is context, the label is the question.
  await expect(prompt).not.toContainText(passage);
  await expect(reference.locator("xpath=..")).toHaveClass(/db-origin-quote/);
});

test("a pending card keeps its prompt", async ({ page }) => {
  await open(page);
  const pending = await ask(page, "zzslow show generation");
  const pendingId = await idOf(pending);
  await expect(pending).toHaveAttribute("data-status", "pending");
  await expect(pending.getByTestId(`prompt-${pendingId}`)).toContainText("zzslow show generation");
});

test("a failed card keeps its prompt", async ({ page }) => {
  await open(page);
  const failed = await ask(page, "zztimeout take too long");
  const failedId = await idOf(failed);
  await expect(failed).toHaveAttribute("data-status", "failed", { timeout: 15000 });
  await expect(failed.getByTestId(`prompt-${failedId}`)).toContainText("zztimeout take too long");
});

test("a stopped card keeps its prompt", async ({ page }) => {
  await open(page);
  const card = await ask(page, "zzslow stop with a prompt");
  const id = await idOf(card);
  await card.locator('[data-testid^="stop-"]').click();
  await expect(card).toHaveAttribute("data-status", "stopped");
  await expect(card.getByTestId(`prompt-${id}`)).toContainText("zzslow stop with a prompt");
});
