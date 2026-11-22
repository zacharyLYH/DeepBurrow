import { expect, test } from "@playwright/test";
import { readSettingsRow, resetDemoBurrow } from "./db.ts";
import { open, signInContext } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

const bodyFont = (page: import("@playwright/test").Page) =>
  page
    .getByTestId("body-node_root")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));

test("sheet opens from the gear, shows the version and closes with Esc", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(page.getByTestId("settings")).toContainText(/DeepBurrow \d+\.\d+\.\d+/);
  await expect(page.getByText("Appearance")).toBeVisible();
  await expect(page.getByText("Asking")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings")).toHaveCount(0);
});

test("reading size applies to card bodies and survives reload", async ({ page }) => {
  await open(page);
  const before = await bodyFont(page);

  await page.getByTestId("open-settings").click();
  await page.getByTestId("reading-up").click();
  await page.getByTestId("reading-up").click();
  await page.keyboard.press("Escape");

  const after = await bodyFont(page);
  expect(after).toBeGreaterThan(before);

  await page.waitForTimeout(400);
  await page.reload();
  await expect.poll(() => bodyFont(page)).toBeCloseTo(after, 1);

  // Reset lands back on the base size.
  await page.getByTestId("open-settings").click();
  await page.getByTestId("reading-reset").click();
  await page.keyboard.press("Escape");
  await expect.poll(() => bodyFont(page)).toBeCloseTo(before, 1);
});

test("preset edits persist on the user row and never touch the other set", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("settings-section-asking").click();

  await page.getByTestId("preset-label-selection-0").fill("Explain simply");
  await page.getByTestId("preset-instruction-selection-0").fill("Short and concrete.");

  // Selection and follow-up stay independent until they are linked.
  await page.getByTestId("preset-tab-followUp").click();
  await expect(page.getByTestId("preset-label-followUp-0")).toHaveValue("Go deeper");
  await page.getByTestId("preset-tab-selection").click();
  await expect(page.getByTestId("preset-label-selection-0")).toHaveValue("Explain simply");

  await page.waitForTimeout(400);
  await page.reload();
  await open(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("settings-section-asking").click();
  await expect(page.getByTestId("preset-label-selection-0")).toHaveValue("Explain simply");
  await expect(page.getByTestId("preset-instruction-selection-0")).toHaveValue("Short and concrete.");
});

test("edits land on user columns and a clean client reads them back", async ({ page, browser }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("settings-section-asking").click();
  await page.getByTestId("theme-dark").click();
  await page.getByTestId("reading-up").click();
  await page.getByTestId("preset-label-selection-0").fill("Explain plainly");
  await page.waitForTimeout(500);

  const saved = readSettingsRow()!;
  expect(saved.theme).toBe("dark");
  expect(saved.reading_size).toBeCloseTo(1.1, 5);
  const presets = JSON.parse(saved.selection_presets!) as {
    label: string;
    instruction: string;
  }[];
  expect(presets[0]).toEqual({
    label: "Explain plainly",
    instruction: "Explain this clearly for someone who knows the basics.",
  });

  // A fresh context has no local state, so everything must come from the row.
  const context = await browser.newContext({ baseURL: "http://localhost:5173" });
  const clean = await context.newPage();
  await signInContext(context);
  await clean.goto("/");
  await expect(clean.locator(".react-flow__node")).toHaveCount(4);
  await expect(clean.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await clean.evaluate(() => localStorage.length)).toBe(0);
  await clean.getByTestId("open-settings").click();
  await clean.getByTestId("settings-section-asking").click();
  await expect(clean.getByTestId("preset-label-selection-0")).toHaveValue("Explain plainly");
  await context.close();
});

test("link mirrors the sets, add and remove edit the list", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("settings-section-asking").click();
  await page.getByTestId("preset-label-selection-0").fill("Mirror me");
  await page.getByTestId("preset-link").check();

  await page.getByTestId("preset-tab-followUp").click();
  await expect(page.getByTestId("preset-label-followUp-0")).toHaveValue("Mirror me");

  await page.getByTestId("preset-add").click();
  await expect(page.getByTestId("preset-label-followUp-3")).toBeVisible();
  await page.getByTestId("preset-remove-followUp-3").click();
  await expect(page.getByTestId("preset-label-followUp-3")).toHaveCount(0);

  // With the sets linked, reset puts the default selection list on both.
  await page.getByTestId("preset-reset").click();
  await expect(page.getByTestId("preset-label-followUp-0")).toHaveValue("Explain");
});
