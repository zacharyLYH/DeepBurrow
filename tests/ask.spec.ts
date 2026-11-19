import { devices, expect, test, type Page } from "@playwright/test";
import { fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";
import { resetDemoBurrow } from "./db.ts";
import {
  ask,
  baseCount,
  jump,
  mutatedCards,
  open,
  openDrawer,
  rootId,
  watchCards,
} from "./helpers.ts";

const settle = (page: Page) => page.waitForTimeout(350);

test.beforeEach(() => resetDemoBurrow());

test("meta lands early, tokens grow, and the header never leaks", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is additive increase?");
  await watchCards(page);
  await expect(card).toHaveAttribute("data-status", "pending");

  await expect(card.locator('[data-testid^="sources-"]')).toBeVisible();
  await expect(card.getByRole("heading", { level: 3 })).toHaveText("What is additive increase?");
  const text = await card.innerText();
  expect(text).not.toContain("TITLE:");
  expect(text).not.toContain("SOURCES:");
  expect(text).not.toContain("FOLLOWUPS:");

  const body = card.locator('[data-testid^="body-"] .db-markdown');
  await expect(body).not.toHaveText("", { timeout: 5000 });
  const first = (await body.innerText()).trim();
  await page.waitForTimeout(150);
  const second = (await body.innerText()).trim();
  expect(first.length).toBeGreaterThan(0);
  expect(second.length).toBeGreaterThan(first.length);

  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 15000 });
  await expect(card.getByText("RFC 5681")).toBeVisible();

  // Streaming repaints the answering card only; the other cards stay untouched.
  const streamed = (await card.getAttribute("data-testid"))!.replace("card-", "");
  expect(await mutatedCards(page)).toEqual([streamed]);
});

test("progress lines show work, never round numbers, then clear when text streams", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is additive increase?");
  const lines = card.locator('[data-testid^="progress-"]');

  await expect(lines).toContainText("Planning the research");
  await expect(lines).toContainText("Why double per RTT?");
  // Second-round question: the plan seeds two, so this proves the loop advanced.
  await expect(lines).toContainText("When does CUBIC win?", { timeout: 10000 });
  await expect(lines).not.toContainText(/Round \d/);

  // Tokens clear the progress list while the card is still pending.
  await expect(lines).toHaveCount(0, { timeout: 15000 });
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
  await expect(card).toHaveAttribute("data-status", "pending");
  // Let a few tokens land so there is partial text to keep.
  await expect(card.locator('[data-testid^="body-"] .db-markdown')).not.toHaveText("", {
    timeout: 5000,
  });

  await card.locator('[data-testid^="stop-"]').click();
  await expect(card).toHaveAttribute("data-status", "stopped");
  const partial = (await card.locator('[data-slot="card-content"]').innerText()).trim();
  expect(partial.length).toBeGreaterThan(0);
  await expect(card.locator('[data-testid^="retry-"]')).toHaveCount(0);
  await expect(await openDrawer(card)).toBeVisible();

  await page.reload();
  const reloaded = page.locator('[data-testid^="card-"]').filter({ hasText: title }).first();
  await expect(reloaded).toHaveAttribute("data-status", "stopped", { timeout: 10000 });
  await expect(reloaded.locator('[data-slot="card-content"]')).toContainText(partial.slice(0, 24));
});

test("stop before any token settles stopped", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is additive increase?");
  await expect(card).toHaveAttribute("data-status", "pending");

  await card.locator('[data-testid^="stop-"]').click();
  await expect(card).toHaveAttribute("data-status", "stopped");
  await expect(card.locator('[data-testid^="body-"]')).toHaveText("");
});

test("reloading during research reattaches and finishes", async ({ page }) => {
  const title = `zzresume ${Date.now()}`;
  await open(page);
  const card = await ask(page, title);
  await expect(card).toHaveAttribute("data-status", "pending");

  const streams: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/nodes/") && request.url().includes("/stream")) {
      streams.push(request.url());
    }
  });

  // The run keeps going server-side; the new page reattaches to it.
  await page.reload();
  const reloaded = page.locator('[data-testid^="card-"]').filter({ hasText: title }).first();
  await expect(reloaded).toHaveAttribute("data-status", /pending|answered/, { timeout: 5000 });
  await expect(reloaded).toHaveAttribute("data-status", "answered", { timeout: 15000 });
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);

  // Reattach is a GET on the node, never a second /ask.
  expect(streams).toHaveLength(1);
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
  await expect(page).toHaveScreenshot("load-error.png");

  failing = false;
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount);
});

test("a follow-up chip fills the drawer, then submits a child", async ({ page }) => {
  await open(page);
  const parent = await ask(page, "Why does slow start double?");
  await expect(parent).toHaveAttribute("data-status", "answered", { timeout: 10000 });
  const parentId = (await parent.getAttribute("data-testid"))!.replace("card-", "");

  const chip = parent.locator('[data-testid^="chip-"]').first();
  const label = (await chip.innerText()).trim();
  await chip.click();

  const input = parent.locator('[data-testid^="drawer-input-"]');
  await expect(input).toHaveValue(label);
  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 1);

  await input.press("Enter");

  await expect(page.locator(".react-flow__node")).toHaveCount(baseCount + 2);
  const child = page.locator('[data-testid^="card-"]').last();
  await expect(child).toHaveAttribute("data-status", "answered", { timeout: 10000 });
  const childId = (await child.getAttribute("data-testid"))!.replace("card-", "");
  expect(childId).not.toBe(parentId);
  await expect(input).toHaveValue("");

  const { nodes } = (await (await page.request.get("/api/burrows/demo")).json()) as {
    nodes: { id: string; parentId: string | null; origin: { question: string } }[];
  };
  const created = nodes.find((node) => node.id === childId);
  expect(created?.parentId).toBe(parentId);
  expect(created?.origin.question).toBe(label);
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

  await openDrawer(card);
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
  await openDrawer(card);
  await settle(page);
  // Settling must not drop the edge layer: one edge per non-root card.
  await expect(page.locator(".react-flow__edge")).toHaveCount(baseCount);
  await expect(page.getByTestId("canvas")).toHaveScreenshot("answered-card.png");
});

test("reload keeps answered cards and does not reattach", async ({ page }) => {
  await open(page);
  const card = await ask(page, "What is congestion avoidance?");
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 15000 });

  const streams: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/nodes/") && request.url().includes("/stream")) {
      streams.push(request.url());
    }
  });

  await page.reload();
  await expect(page.getByTestId("burrow-title")).toHaveText(fixtureBurrow.title);
  await expect(
    page.getByRole("heading", { name: "What is congestion avoidance?" }).first(),
  ).toBeVisible();
  expect(await page.locator(".react-flow__node").count()).toBe(baseCount + 1);

  await page.waitForTimeout(300);
  expect(streams).toEqual([]);
});

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];

test.describe("mobile", () => {
  test.use(iphone13);

  test("answered card and its drawer fit the phone", async ({ page }) => {
    await open(page);
    const card = await ask(page, "What is CUBIC?");
    await expect(card).toHaveAttribute("data-status", "answered", { timeout: 10000 });

    // Re-center once the answer is settled: the camera first moves while the card
    // is still streaming, so that framing shifts between runs. A palette jump
    // uses the final measured size and makes the screenshot deterministic.
    await jump(page, "What is CUBIC");
    const input = await openDrawer(card);

    await settle(page);

    const viewport = page.viewportSize()!;
    const box = await card.boundingBox();
    const drawer = await card.locator('[data-testid^="drawer-"]').first().boundingBox();
    const body = await card.locator('[data-slot="card-content"]').boundingBox();
    if (!box || !drawer || !body) throw new Error("missing box");

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(drawer.y).toBeGreaterThanOrEqual(box.y + box.height);
    expect(drawer.y + drawer.height).toBeLessThanOrEqual(viewport.height);
    expect(body.height).toBeGreaterThan(60);
    await expect(input).toBeFocused();

    await expect(page.getByTestId("canvas")).toHaveScreenshot("answered-card-mobile.png");
  });
});
