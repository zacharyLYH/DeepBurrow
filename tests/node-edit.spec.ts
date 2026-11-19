import { expect, test } from "@playwright/test";
import { readNodeRow, resetDemoBurrow } from "./db.ts";
import { card, cards, menu, open, rootId } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

test("rename inline and persist it on the server", async ({ page }) => {
  await open(page);
  await menu(page, rootId);
  await page.getByTestId(`rename-${rootId}`).click();

  const input = page.getByTestId(`rename-input-${rootId}`);
  await expect(input).toBeVisible();
  await input.fill("TCP, renamed");
  await input.press("Enter");

  await expect(card(page, rootId).getByRole("heading", { level: 3 })).toHaveText("TCP, renamed");
  await expect.poll(() => readNodeRow(rootId)?.title).toBe("TCP, renamed");

  await page.reload();
  await expect(card(page, rootId).getByRole("heading", { level: 3 })).toHaveText("TCP, renamed");
});

test("delete removes the branch, undo restores it and its descendants", async ({ page }) => {
  await open(page);
  await menu(page, rootId);
  await page.getByTestId(`delete-${rootId}`).click();

  await expect(cards(page)).toHaveCount(0);
  await expect(page.getByText(/Branch deleted/)).toBeVisible();
  expect(readNodeRow(rootId)?.deleted_at).not.toBeNull();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(cards(page)).toHaveCount(4, { timeout: 10000 });
  await expect.poll(() => readNodeRow(rootId)?.deleted_at).toBeNull();
  await expect(card(page, "node_why")).toBeVisible();
});

test("deleting a single child leaves the root in place", async ({ page }) => {
  await open(page);
  await menu(page, "node_why");
  await page.getByTestId("delete-node_why").click();

  await expect(cards(page)).toHaveCount(3);
  await expect(card(page, rootId)).toBeVisible();
  await expect(card(page, "node_why")).toHaveCount(0);
});
