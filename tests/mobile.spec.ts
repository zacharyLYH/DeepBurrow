import { devices, expect, test, type Page } from "@playwright/test";
import { resetDemoBurrow, readNodeRow, readViewport } from "./db.ts";
import { card, cards, jump, open, rootId, viewportMatrix } from "./helpers.ts";

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];
test.use(iphone13);
test.beforeEach(() => resetDemoBurrow());

const tap = async (page: Page, testId: string) => {
  const target = page.getByTestId(testId);
  await expect(target).toBeVisible();
  await target.tap();
};

test("mobile chrome is reachable and legible", async ({ page }) => {
  await open(page);

  // Palette jumps to a card, which also centers it for the rest of the test.
  await jump(page, "CUBIC win");
  await expect(card(page, "node_cubic")).toBeInViewport();

  await tap(page, "open-settings");
  const sheet = page.getByTestId("settings");
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(300);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  await tap(page, "menu-node_cubic");
  await expect(page.getByTestId("menu-panel-node_cubic")).toBeVisible();
  await page.keyboard.press("Escape");

  const size = await page
    .getByTestId("body-node_cubic")
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(size).toBeGreaterThanOrEqual(13);
});

test("tapping the follow-up button opens the drawer", async ({ page }) => {
  await open(page);
  await tap(page, `drawer-handle-${rootId}`);

  const input = page.getByTestId(`drawer-input-${rootId}`);
  await expect(input).toBeFocused();
  await input.fill("Why does the window grow?");
  await input.press("Enter");
  await expect(cards(page)).toHaveCount(5);
});

test("tapping a preset in the drawer asks without closing it", async ({ page }) => {
  await open(page);
  await tap(page, `drawer-handle-${rootId}`);
  await expect(page.getByTestId(`drawer-input-${rootId}`)).toBeFocused();

  // Tapping the preset blurs the textarea; the drawer must stay open long
  // enough for the tap to land.
  await page.getByTestId(`drawer-preset-${rootId}-0`).tap();
  await expect(cards(page)).toHaveCount(5);
  await expect(page.getByTestId(`drawer-input-${rootId}`)).toHaveCount(1);
});

test("a finger long-press on text asks about the passage", async ({ page }) => {
  await open(page);

  // Real touch input from the browser, held over the paragraph. Chromium cannot
  // synthesize the OS selection a long-press produces, so the range the OS would
  // send is settled in between the touch events.
  const paragraph = card(page, "node_root").locator(".db-markdown p").first();
  const target = await paragraph.boundingBox();
  if (!target) throw new Error("no paragraph");
  const cdp = await page.context().newCDPSession(page);
  const point = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });

  const passage = await page.evaluate(() => {
    const host = document.querySelector(`[data-card-id="node_root"]`);
    const textNode = host?.querySelector(".db-markdown p")?.firstChild;
    if (!textNode?.textContent) throw new Error("no text");
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, 36);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    return textNode.textContent.slice(0, 36);
  });

  const popover = page.getByTestId("ask-popover");
  await expect(popover).toBeVisible();

  // Lifting the finger must not dismiss what the selection opened.
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(300);
  await expect(popover).toBeVisible();
  const box = await popover.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("no popover");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);

  // Presets submit from the popover on touch too.
  await page.getByTestId("ask-preset-0").tap();
  await expect(cards(page)).toHaveCount(5);
  const child = cards(page).last();
  const childId = (await child.getAttribute("data-testid"))!.replace("card-", "");
  await expect(child.getByTestId(`reference-${childId}`)).toContainText(passage);
  await expect(card(page, rootId).locator("mark")).toHaveCount(0);

  const { nodes } = (await (await page.request.get("/api/burrows/demo")).json()) as {
    nodes: { id: string; parentId: string | null; origin: { selectedText?: string } }[];
  };
  expect(nodes.some((node) => node.parentId === "node_root" && node.origin.selectedText === passage)).toBe(
    true,
  );
});

test("mobile restores the shared camera", async ({ page }) => {
  await open(page);
  await expect.poll(async () => (await viewportMatrix(page)).x).toBeCloseTo(readViewport().x, 0);
  const matrix = await viewportMatrix(page);
  expect(matrix.y).toBeCloseTo(readViewport().y, 0);
  expect(matrix.scale).toBeCloseTo(readViewport().zoom, 2);
  await expect(card(page, rootId)).toBeVisible();
});

test("a desktop drag lands on mobile unchanged", async ({ page }) => {
  await open(page);
  const head = await card(page, rootId).locator(".db-card-head").boundingBox();
  if (!head) throw new Error("no head");
  await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
  await page.mouse.down();
  await page.mouse.move(head.x + head.width / 2 + 90, head.y + head.height / 2 + 40, { steps: 10 });
  await page.mouse.up();

  await expect.poll(() => readNodeRow(rootId)?.position_x ?? 0).toBeGreaterThan(50);
  await page.waitForTimeout(500);
  const saved = readNodeRow(rootId)!;
  const savedViewport = readViewport();

  // The phone is a separate context reading the same rows.
  const phone = await page.context().browser()!.newContext({ ...iphone13, baseURL: "http://localhost:5173" });
  const mobile = await phone.newPage();
  await mobile.goto("/");
  await expect(mobile.locator(".react-flow__node")).toHaveCount(4);

  const matrix = await viewportMatrix(mobile);
  expect(matrix.x).toBeCloseTo(savedViewport.x, 0);
  expect(matrix.y).toBeCloseTo(savedViewport.y, 0);
  expect(matrix.scale).toBeCloseTo(savedViewport.zoom, 2);

  const phoneBox = await card(mobile, rootId).boundingBox();
  const desktopBox = await card(page, rootId).boundingBox();
  if (!phoneBox || !desktopBox) throw new Error("no card");
  // React Flow re-measures nodes on mount; a few sub-pixel points of drift is fine.
  expect(Math.abs(phoneBox.x - desktopBox.x)).toBeLessThan(6);
  expect(Math.abs(phoneBox.y - desktopBox.y)).toBeLessThan(6);
  expect(saved.position_x).toBeCloseTo(readNodeRow(rootId)!.position_x, 2);
  await phone.close();
});
