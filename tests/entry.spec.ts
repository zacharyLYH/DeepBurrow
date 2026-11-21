import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { cards, open } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

test("an empty canvas offers the new burrow dialog", async ({ page }) => {
  await open(page);
  // A seeded burrow with no cards is the empty-canvas state.
  await page.getByTestId("burrow-row-burrow_second").click();
  await expect(page.getByTestId("empty-canvas")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  await page.getByTestId("empty-new-burrow").click();
  await expect(page.getByTestId("new-burrow-dialog")).toBeVisible();
});

test("a loaded burrow never shows the empty canvas", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("empty-canvas")).toHaveCount(0);
});
