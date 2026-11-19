import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { open, viewportMatrix } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

test("⌘K finds a card by body text and centers it", async ({ page }) => {
  await open(page);
  const before = await viewportMatrix(page);

  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("palette")).toBeVisible();

  await page.getByTestId("palette-input").fill("head-of-line");
  const row = page.getByTestId("palette-row-0");
  await expect(row).toContainText("TCP vs QUIC congestion");
  await expect(row).toContainText("body");

  await page.keyboard.press("Enter");
  await expect(page.getByTestId("palette")).toHaveCount(0);

  // Center moves the camera onto the matching card.
  await expect
    .poll(async () => {
      const now = await viewportMatrix(page);
      return Math.abs(now.x - before.x) + Math.abs(now.y - before.y);
    })
    .toBeGreaterThan(10);
});

test("searches title, origin question and selected passage", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");

  await page.getByTestId("palette-input").fill("CUBIC win");
  await expect(page.getByTestId("palette-row-0")).toContainText("When does CUBIC win?");

  await page.getByTestId("palette-input").fill("differ from");
  await expect(page.getByTestId("palette-row-0")).toContainText("question");

  await page.getByTestId("palette-input").fill("nothing matches this");
  await expect(page.getByText("No match")).toBeVisible();
});

test("commands run and Esc closes", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("palette-row-0")).toContainText("Fit to screen");

  // Keyboard-only: run the first command.
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("palette")).toHaveCount(0);

  await page.keyboard.press("Control+k");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("palette")).toHaveCount(0);
});

test("? opens the shortcut hints", async ({ page }) => {
  await open(page);
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcuts")).toBeVisible();
  await expect(page.getByTestId("shortcuts")).toContainText("Shift+drag");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shortcuts")).toHaveCount(0);
});
