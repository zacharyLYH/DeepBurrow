import { devices, expect, test } from "@playwright/test";
import { demoCredentials } from "../packages/types/src/fixtures.ts";
import { clearProviders, resetDemoBurrow } from "./db.ts";
import { ask, cards, jump, menu, open, rootId, selectPassage, signIn } from "./helpers.ts";

// High-signal chrome states. Whole viewport, animations frozen.
test.beforeEach(() => resetDemoBurrow());

const shot = async (page: import("@playwright/test").Page, name: string) =>
  expect(page).toHaveScreenshot(name, { animations: "disabled" });

test("login page", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByTestId("auth-screen")).toBeVisible();
  await shot(page, "login.png");
});

test("account creation code page", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByTestId("auth-email").fill(demoCredentials.email);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-code")).toBeVisible();
  await shot(page, "code-entry.png");
});

test("settings sheet", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("settings")).toBeVisible();
  await expect(page.getByTestId("settings-providers")).toBeVisible();
  await shot(page, "settings-sheet.png");
});

test("workspace without a model shows a centered dismissible prompt", async ({ page }) => {
  clearProviders();
  await signIn(page);
  await page.goto("/app");
  await expect(page.getByTestId("model-prompt")).toBeVisible();
  await shot(page, "model-prompt.png");

  await page.getByTestId("model-prompt-open").click();
  await expect(page.getByTestId("model-base-url")).toBeVisible();
  await shot(page, "model-settings.png");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("settings")).toHaveCount(0);
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
  await expect(rich.locator(".db-mermaid svg")).toBeVisible();
  await expect(rich.locator(".katex").first()).toBeVisible();
  await page.waitForTimeout(400);

  await shot(page, "rich-markdown.png");
});

test("pending card shows generation work", async ({ page }) => {
  await open(page);
  const card = await ask(page, "zzslow show generation");
  await expect(card.locator('[data-testid^="progress-"]')).toContainText("Writing the answer…");
  await expect(card.locator('[data-testid^="stop-"]')).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "pending-card.png");
});

test("timed out card explains itself", async ({ page }) => {
  await open(page);
  const card = await ask(page, "zztimeout take too long");
  await expect(card).toHaveAttribute("data-status", "failed", { timeout: 15_000 });
  await expect(card.getByText("Failed: Model timed out")).toBeVisible();
  await expect(card.locator('[data-testid^="retry-"]')).toHaveClass(/bg-emerald-600/);
  await expect(card.locator('[data-testid^="drawer-handle-"]')).toHaveCount(0);
  await shot(page, "timeout-card.png");
});

test("burrows sidebar expanded", async ({ page }) => {
  await open(page);
  const sidebar = page.getByTestId("burrow-sidebar");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await expect(sidebar.locator('[data-testid^="burrow-row-"]')).toHaveCount(3);
  await expect(page.getByTestId(`prompt-${rootId}`)).toContainText(
    "How does TCP congestion control work?",
  );
  await shot(page, "burrows-expanded.png");
});

test("burrows sidebar collapsed", async ({ page }) => {
  await open(page);
  await page.getByTestId("open-burrows").click();
  await expect(page.getByTestId("burrow-sidebar")).toHaveAttribute("data-state", "collapsed");
  await expect(page.getByTestId(`prompt-${rootId}`)).toBeVisible();
  await shot(page, "burrows-collapsed.png");
});

test("empty canvas offers a new burrow", async ({ page }) => {
  await open(page);
  await page.getByTestId("burrow-row-burrow_second").click();
  await expect(page.getByTestId("empty-canvas")).toBeVisible();
  await shot(page, "empty-canvas.png");
});

test("new burrow modal", async ({ page }) => {
  await open(page);
  await page.getByTestId("new-burrow").click();
  await expect(page.getByTestId("new-burrow-dialog")).toBeVisible();
  await shot(page, "new-burrow-dialog.png");
});

test("new burrow first message is sending", async ({ page }) => {
  await open(page);
  await page.getByTestId("new-burrow").click();
  await page.getByTestId("new-burrow-input").fill("How does TCP congestion control work?");
  await page.getByTestId("new-burrow-submit").click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).last()).toHaveAttribute("data-status", "pending");
  await shot(page, "new-burrow-sending.png");
});

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];

test.describe("mobile", () => {
  test.use(iphone13);

  test("login page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.getByTestId("auth-screen")).toBeVisible();
    await shot(page, "login-mobile.png");
  });

  test("account creation code page", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByTestId("auth-email").fill(demoCredentials.email);
    await page.getByTestId("auth-submit").tap();
    await expect(page.getByTestId("auth-code")).toBeVisible();
    await shot(page, "code-entry-mobile.png");
  });

  test("workspace without a model prompt", async ({ page }) => {
    clearProviders();
    await signIn(page);
    await page.goto("/app");
    await expect(page.getByTestId("model-prompt")).toBeVisible();
    await shot(page, "model-prompt-mobile.png");

    await page.getByTestId("model-prompt-open").tap();
    await expect(page.getByTestId("model-base-url")).toBeVisible();
    await shot(page, "model-settings-mobile.png");
  });

  test("settings sheet", async ({ page }) => {
    await open(page);
    await page.getByTestId("open-settings").tap();
    await expect(page.getByTestId("settings")).toBeVisible();
    await expect(page.getByTestId("settings-providers")).toBeVisible();
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
    await expect(rich.locator(".db-mermaid svg")).toBeVisible();
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

  test("pending card", async ({ page }) => {
    await open(page);
    const card = await ask(page, "zzslow show generation");
    await expect(card.locator('[data-testid^="progress-"]')).toContainText("Writing the answer…");
    await expect(card.locator('[data-testid^="stop-"]')).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, "pending-card-mobile.png");
  });

  test("timed out card", async ({ page }) => {
    await open(page);
    const card = await ask(page, "zztimeout take too long");
    await expect(card).toHaveAttribute("data-status", "failed", { timeout: 15_000 });
    await expect(card.getByText("Failed: Model timed out")).toBeVisible();
    await expect(card.locator('[data-testid^="retry-"]')).toHaveClass(/bg-emerald-600/);
    await expect(card.locator('[data-testid^="drawer-handle-"]')).toHaveCount(0);
    await shot(page, "timeout-card-mobile.png");
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

  test("burrow sheet lists burrows above the selected card prompt", async ({ page }) => {
    await open(page);
    await jump(page, "TCP congestion control");
    await page.getByTestId("open-burrows").tap();

    const sheet = page.getByRole("dialog", { name: "Burrows" });
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('[data-testid^="burrow-row-"]')).toHaveCount(3);
    await expect(page.getByTestId(`prompt-${rootId}`)).toContainText(
      "How does TCP congestion control work?",
    );
    await shot(page, "burrows-sheet-mobile.png");
  });

  test("empty canvas offers a new burrow", async ({ page }) => {
    await open(page);
    await page.getByTestId("open-burrows").tap();
    const sheet = page.getByRole("dialog", { name: "Burrows" });
    await sheet.getByTestId("burrow-row-burrow_second").tap();
    await expect(page.getByTestId("empty-canvas")).toBeVisible();
    await shot(page, "empty-canvas-mobile.png");
  });

  test("new burrow modal", async ({ page }) => {
    await open(page);
    await page.getByTestId("open-burrows").tap();
    await page.getByTestId("new-burrow").tap();
    await expect(page.getByTestId("new-burrow-dialog")).toBeVisible();
    await shot(page, "new-burrow-dialog-mobile.png");
  });

  test("new burrow first message is sending", async ({ page }) => {
    await open(page);
    await page.getByTestId("open-burrows").tap();
    await page.getByTestId("new-burrow").tap();
    await page.getByTestId("new-burrow-input").fill("How does TCP congestion control work?");
    await page.getByTestId("new-burrow-submit").tap();
    await expect(cards(page)).toHaveCount(1);
    await expect(cards(page).last()).toHaveAttribute("data-status", "pending");
    await shot(page, "new-burrow-sending-mobile.png");
  });
});
