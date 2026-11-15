import { devices, expect, test, type Page } from "@playwright/test";
import { fixtureNodes } from "../packages/types/src/fixtures.ts";

const rootId = fixtureNodes[0].id;
const baseCount = fixtureNodes.length;

const open = async (page: Page, scenario?: string) => {
  if (scenario) await page.setExtraHTTPHeaders({ "x-mock-scenario": scenario });
  await page.goto("/");
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount);
  await page.waitForTimeout(200);
};

const settle = (page: Page) => page.waitForTimeout(350);

const openDrawer = async (page: Page, card: ReturnType<Page["getByTestId"]>) => {
  const handle = card.locator('[data-testid^="drawer-handle-"]');
  await card.hover();
  await handle.click();
  const input = card.locator('[data-testid^="drawer-input-"]');
  await expect(input).toBeVisible();
  return input;
};

const ask = async (page: Page, text: string) => {
  const input = await openDrawer(page, page.getByTestId(`card-${rootId}`));
  await input.fill(text);
  await input.press("Enter");
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);
  const id = await page.locator('[data-testid^="card-"]').last().getAttribute("data-testid");
  if (!id) throw new Error("no card id");
  return page.getByTestId(id);
};

test("reaches pending, streaming, answered", async ({ page }) => {
  await open(page, "slow");
  const card = await ask(page, "What is additive increase?");

  await expect(card).toHaveAttribute("data-status", "pending");
  await expect(card).toHaveAttribute("data-status", "streaming", { timeout: 5000 });
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 15000 });
  await expect(card.getByText("RFC 5681")).toBeVisible();
});

test("failed card shows reason and retry recovers same node", async ({ page }) => {
  await open(page, "fail");
  const card = await ask(page, "Does this fail?");

  await expect(card).toHaveAttribute("data-status", "failed", { timeout: 5000 });
  await expect(card.getByText("Failed: Model timed out")).toBeVisible();

  await card.locator('[data-testid^="retry-"]').click();
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 5000 });
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);
});

test("title and sources land before stream ends, header never leaks", async ({ page }) => {
  await open(page, "slow");
  const card = await ask(page, "What is congestion avoidance?");

  await expect(card.locator('[data-testid^="sources-"]')).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "streaming");
  await expect(card.getByRole("heading", { level: 3 })).toHaveText("What is congestion avoidance?");

  const text = await card.innerText();
  expect(text).not.toContain("TITLE:");
  expect(text).not.toContain("SOURCES:");
  expect(text).not.toContain("FOLLOWUPS:");
});

test("follow-up chip fills the drawer without submitting", async ({ page }) => {
  await open(page);
  const card = await ask(page, "Why does slow start double?");
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 10000 });

  const chip = card.locator('[data-testid^="chip-"]').first();
  const label = (await chip.innerText()).trim();
  await chip.click();

  await expect(card.locator('[data-testid^="drawer-input-"]')).toHaveValue(label);
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);
});

test("stop keeps partial text and hides retry", async ({ page }) => {
  await open(page, "slow");
  const card = await ask(page, "Explain the congestion window");
  await expect(card).toHaveAttribute("data-status", "streaming", { timeout: 5000 });

  await card.locator('[data-testid^="stop-"]').click();
  await expect(card).toHaveAttribute("data-status", "stopped");
  await expect(card.locator('[data-slot="card-content"]')).toContainText(/\w/);
  await expect(card.locator('[data-testid^="retry-"]')).toHaveCount(0);
  await expect(await openDrawer(page, card)).toBeVisible();
});

test("follow-up drawer sits below the card, body stays readable", async ({ page }) => {
  await open(page);
  const card = await ask(page, "Why does slow start double?");
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 10000 });

  const body = card.locator('[data-slot="card-content"]');
  const bodyHeight = await body.evaluate((element) => element.clientHeight);
  expect(bodyHeight).toBeGreaterThan(100);

  const cardBox = await card.boundingBox();
  const handleBox = await card.locator('[data-testid^="drawer-handle-"]').boundingBox();
  if (!cardBox || !handleBox) throw new Error("missing box");
  expect(handleBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);

  await openDrawer(page, card);
  await settle(page);
  const inputBox = await card.locator('[data-testid^="drawer-input-"]').boundingBox();
  if (!inputBox) throw new Error("missing input box");
  expect(inputBox.y).toBeGreaterThanOrEqual(cardBox.y + cardBox.height);
  expect(await body.evaluate((element) => element.clientHeight)).toBe(bodyHeight);
});

test("selecting text asks a preset child", async ({ page }) => {
  await open(page);
  const body = page.getByTestId(`card-${rootId}`).locator('[data-slot="card-content"]');
  const paragraph = body.locator("p").first();
  const box = await paragraph.boundingBox();
  if (!box) throw new Error("no body");

  await page.mouse.move(box.x + 2, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 4, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId("ask-popover")).toBeVisible();
  await page.getByTestId("ask-input").fill("What does the window do?");
  await page.getByTestId("ask-popover").getByRole("button", { name: /Go deeper/ }).click();

  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);
  const card = page.locator('[data-testid^="card-"]').last();
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 10000 });
});

test("stable answered card", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is CUBIC?");
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 10000 });
  await openDrawer(page, card);
  await settle(page);
  await expect(page.getByTestId("canvas")).toHaveScreenshot("answered-card.png", {
    maxDiffPixelRatio: 0.01,
  });
});

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];

test.describe("mobile", () => {
  test.use(iphone13);

  test("stable answered card", async ({ page }) => {
    await open(page);
    const card = await ask(page, "What is CUBIC?");
    await expect(card).toHaveAttribute("data-status", "answered", { timeout: 10000 });
    await openDrawer(page, card);
    await settle(page);
    await expect(page.getByTestId("canvas")).toHaveScreenshot("answered-card-mobile.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
