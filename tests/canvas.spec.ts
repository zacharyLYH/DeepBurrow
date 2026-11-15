import { devices, expect, test, type Page } from "@playwright/test";
import { fixtureNodes } from "../packages/types/src/fixtures.ts";

const viewportTransform = (page: Page) =>
  page
    .locator(".react-flow__viewport")
    .evaluate((element) => getComputedStyle(element).transform);

const viewportState = (page: Page) =>
  page.locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f, scale: matrix.a };
  });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".react-flow__node")).toHaveCount(fixtureNodes.length);
  await page.waitForTimeout(300);
});

test("pans and zooms the plane", async ({ page }) => {
  const before = await viewportTransform(page);

  const box = await page.locator(".react-flow__pane").boundingBox();
  if (!box) throw new Error("no pane");
  const startX = box.x + box.width - 40;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 140, startY, { steps: 10 });
  await page.mouse.up();

  expect(await viewportTransform(page)).not.toBe(before);

  const panScale = (await viewportState(page)).scale;
  await page.locator(".react-flow__controls-zoomin").click();
  expect((await viewportState(page)).scale).toBeGreaterThan(panScale);
});

test("children sit below parent without overlap", async ({ page }) => {
  const boxes = await Promise.all(
    fixtureNodes.map((node) =>
      page.locator(`.react-flow__node[data-id="${node.id}"]`).boundingBox(),
    ),
  );
  const [parentBox, ...childBoxes] = boxes;
  if (!parentBox || childBoxes.some((box) => !box)) throw new Error("missing node box");
  const children = childBoxes as { x: number; y: number; width: number }[];

  for (const child of children) {
    expect(parentBox.y).toBeLessThan(child.y);
    expect(Math.abs(child.y - children[0].y)).toBeLessThan(1);
  }

  const sorted = [...children].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    expect(sorted[i - 1].x + sorted[i - 1].width).toBeLessThanOrEqual(sorted[i].x);
  }
});

test("long node body scrolls inside its card", async ({ page }) => {
  const body = page.getByTestId("card-node_long").locator('[data-slot="card-content"]');

  const metrics = await body.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(metrics.scrollHeight).toBeGreaterThan(metrics.clientHeight);

  await body.evaluate((element) => {
    element.scrollTop = 200;
  });
  await expect.poll(() => body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
});

test("stable visuals", async ({ page }) => {
  await expect(page.getByTestId("canvas")).toHaveScreenshot("canvas.png", {
    maxDiffPixelRatio: 0.01,
  });
});

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];

test.describe("mobile", () => {
  test.use(iphone13);

  test("stable visuals", async ({ page }) => {
    await expect(page.getByTestId("canvas")).toHaveScreenshot("canvas-mobile.png", {
      maxDiffPixelRatio: 0.01,
    });
  });
});
