import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { open } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

const html = (page: import("@playwright/test").Page) => page.locator("html");

test("theme starts light, toggles with an icon, and survives reload", async ({ page }) => {
  await open(page);
  const toggle = page.getByTestId("theme-toggle");
  await expect(toggle).toHaveAttribute("data-theme-value", "light");
  await expect(toggle.locator("svg")).toBeVisible();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  const lightBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-theme-value", "dark");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(darkBackground).not.toBe(lightBackground);

  // The choice lives on the user row, so a reload reads it back.
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByTestId("theme-toggle")).toHaveAttribute("data-theme-value", "dark");
  await expect(html(page)).toHaveAttribute("data-theme", "dark");
});

test("settings theme buttons drive the same tokens and Esc closes the sheet", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(page.getByTestId("theme-system")).toHaveCount(0);

  await page.getByTestId("theme-light").click();
  await expect(html(page)).toHaveAttribute("data-theme", "light");
  await page.getByTestId("theme-dark").click();
  await expect(html(page)).toHaveAttribute("data-theme", "dark");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings")).toHaveCount(0);
});

test("theme keeps both surfaces readable", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("theme-dark").click();
  await page.keyboard.press("Escape");

  const card = page.getByTestId("card-node_root");
  const contrast = await card.locator("h3").evaluate((element) => {
    const color = getComputedStyle(element).color;
    const background = getComputedStyle(element.closest("[data-slot='card']")!).backgroundColor;
    return { color, background };
  });
  expect(contrast.color).not.toBe(contrast.background);
});
