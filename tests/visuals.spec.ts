import { devices, expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { ask, cards, jump, menu, open, rootId, selectPassage } from "./helpers.ts";

// High-signal chrome states. Whole viewport, animations frozen.
test.beforeEach(() => resetDemoBurrow());

const shot = async (page: import("@playwright/test").Page, name: string) =>
  expect(page).toHaveScreenshot(name, { animations: "disabled" });

test("settings sheet", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await shot(page, "settings-sheet.png");
});

test("command palette", async ({ page }) => {
  await open(page);
  await page.keyboard.press("Control+k");
  await page.getByTestId("palette-input").fill("QUIC");
  await expect(page.getByTestId("palette-row-0")).toBeVisible();
  await shot(page, "palette.png");
});

test("card menu", async ({ page }) => {
  await open(page);
  await menu(page, rootId);
  await expect(page.getByTestId(`menu-panel-${rootId}`)).toBeVisible();
  await shot(page, "card-menu.png");
});

test("dark canvas", async ({ page }) => {
  await open(page);
  await page.getByTestId("theme-toggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await shot(page, "dark-canvas.png");
});

test("rich markdown card", async ({ page }) => {
  await open(page);
  const rich = await ask(page, "zzmd render everything");
  await expect(rich).toHaveAttribute("data-status", "answered", { timeout: 20000 });
  await expect(rich.getByTestId("mermaid")).toBeVisible();
  await expect(rich.locator(".katex").first()).toBeVisible();
  await page.waitForTimeout(400);

  await shot(page, "rich-markdown.png");
});

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];

test.describe("mobile", () => {
  test.use(iphone13);

  test("settings sheet", async ({ page }) => {
    await open(page);
    await page.getByTestId("open-settings").tap();
    await expect(page.getByTestId("settings")).toBeVisible();
    await shot(page, "settings-sheet-mobile.png");
  });

  test("command palette", async ({ page }) => {
    await open(page);
    await page.getByTestId("open-palette").tap();
    await page.getByTestId("palette-input").fill("QUIC");
    await expect(page.getByTestId("palette-row-0")).toBeVisible();
    await shot(page, "palette-mobile.png");
  });

  test("card menu", async ({ page }) => {
    await open(page);
    await page.getByTestId(`menu-${rootId}`).tap();
    await expect(page.getByTestId(`menu-panel-${rootId}`)).toBeVisible();
    await shot(page, "card-menu-mobile.png");
  });

  test("dark canvas", async ({ page }) => {
    await open(page);
    await page.getByTestId("theme-toggle").tap();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await shot(page, "dark-canvas-mobile.png");
  });

  test("rich markdown card", async ({ page }) => {
    await open(page);
    const rich = await ask(page, "zzmd render everything");
    await expect(rich).toHaveAttribute("data-status", "answered", { timeout: 20000 });
    await expect(rich.getByTestId("mermaid")).toBeVisible();
    await expect(rich.locator(".katex").first()).toBeVisible();
    await jump(page, "zzmd");
    const zoom = page.getByTestId("zoom-percent");
    await page.getByRole("button", { name: "Zoom out" }).tap();
    await expect(zoom).toHaveText("75%");
    await page.getByRole("button", { name: "Zoom out" }).tap();
    await expect(zoom).toHaveText(/6\d%/);
    await page.waitForTimeout(500);
    await shot(page, "rich-markdown-mobile.png");
  });

  test("reference answer", async ({ page }) => {
    await open(page);
    const passage = await selectPassage(page, rootId);
    await page.getByTestId("ask-preset-0").tap();

    await expect(cards(page)).toHaveCount(5);
    const child = cards(page).last();
    await expect(child).toHaveAttribute("data-status", "answered", { timeout: 10000 });
    const childId = (await child.getAttribute("data-testid"))!.replace("card-", "");
    await expect(child.getByTestId(`reference-${childId}`)).toContainText(passage);

    await jump(page, "Explain");
    await shot(page, "reference-card-mobile.png");
  });
});
