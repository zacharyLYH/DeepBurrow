import { devices, expect, test, type Page } from "@playwright/test";
import { fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";
import { resetDemoBurrow } from "./db.ts";

const rootId = fixtureNodes[0].id;
const baseCount = fixtureNodes.length;

const open = async (page: Page) => {
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

test.beforeEach(() => resetDemoBurrow());

test("streams pending → streaming → answered, appending tokens", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is additive increase?");

  await expect(card).toHaveAttribute("data-status", "pending");
  await expect(card).toHaveAttribute("data-status", "streaming", { timeout: 5000 });

  const body = card.locator('[data-slot="card-content"]');
  const first = (await body.innerText()).trim();
  await page.waitForTimeout(150);
  const second = (await body.innerText()).trim();
  expect(first.length).toBeGreaterThan(0);
  expect(second.length).toBeGreaterThan(first.length);

  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 15000 });
  await expect(card.getByText("RFC 5681")).toBeVisible();
});

test("title and sources land before the body finishes, header never leaks", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is congestion avoidance?");

  await expect(card.locator('[data-testid^="sources-"]')).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "streaming");
  await expect(card.getByRole("heading", { level: 3 })).toHaveText("What is congestion avoidance?");

  const text = await card.innerText();
  expect(text).not.toContain("TITLE:");
  expect(text).not.toContain("SOURCES:");
  expect(text).not.toContain("FOLLOWUPS:");

  // Let the stream finish so its row lands before the next test resets the burrow.
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 15000 });
});

test("failed card shows reason and retry recovers same node", async ({ page }) => {
  await open(page);
  // The fake model fails the first summarize for an ask carrying this marker, so
  // the server's real error path runs, then recovers on retry.
  const card = await ask(page, "Does zzfail break?");
  await expect(card).toHaveAttribute("data-status", "failed", { timeout: 5000 });
  await expect(card.getByText("Failed: Model timed out")).toBeVisible();

  await card.locator('[data-testid^="retry-"]').click();
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 5000 });
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);
});

test("stop keeps partial text, hides retry, and survives reload", async ({ page }) => {
  const title = `zzstop ${Date.now()}`;
  await open(page);
  const card = await ask(page, title);
  await expect(card).toHaveAttribute("data-status", "streaming", { timeout: 5000 });

  await card.locator('[data-testid^="stop-"]').click();
  await expect(card).toHaveAttribute("data-status", "stopped");
  const partial = (await card.locator('[data-slot="card-content"]').innerText()).trim();
  expect(partial.length).toBeGreaterThan(0);
  await expect(card.locator('[data-testid^="retry-"]')).toHaveCount(0);
  await expect(await openDrawer(page, card)).toBeVisible();

  await page.reload();
  const reloaded = page.locator('[data-testid^="card-"]').filter({ hasText: title }).first();
  await expect(reloaded).toHaveAttribute("data-status", "stopped", { timeout: 10000 });
  await expect(reloaded.locator('[data-slot="card-content"]')).toContainText(partial.slice(0, 24));
});

test("load failure offers retry", async ({ page }) => {
  let failing = true;
  await page.route("**/api/burrows/demo", (route) =>
    failing
      ? route.fulfill({ status: 500, body: "boom" })
      : route.fulfill({ json: { burrow: fixtureBurrow, nodes: fixtureNodes } }),
  );
  await page.goto("/");

  await expect(page.getByText("Couldn't load the burrow.")).toBeVisible();
  await expect(page).toHaveScreenshot("load-error.png", { maxDiffPixelRatio: 0.01 });

  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount);
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

test("reload keeps answered cards", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is congestion avoidance?");
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 15000 });

  await page.reload();

  await expect(page.getByTestId("burrow-title")).toHaveText(fixtureBurrow.title);
  await expect(
    page.getByRole("heading", { name: "What is congestion avoidance?" }).first(),
  ).toBeVisible();
  expect(await page.locator(".react-flow__node").count()).toBe(baseCount + 1);
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
