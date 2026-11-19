import { devices, expect, test, type Page } from "@playwright/test";
import { fixtureNodes } from "../packages/types/src/fixtures.ts";
import { resetDemoBurrow } from "./db.ts";
import { open, viewportMatrix } from "./helpers.ts";

const viewportTransform = (page: Page) =>
  page
    .locator(".react-flow__viewport")
    .evaluate((element) => getComputedStyle(element).transform);

// Two columns, uneven heights, the longest card in the middle: nothing shares a row.
const scattered: Record<string, { x: number; y: number }> = {
  node_root: { x: 40, y: 440 },
  node_why: { x: 420, y: 60 },
  node_cubic: { x: 40, y: 660 },
  node_long: { x: 420, y: 260 },
};

// Writes the scatter (and optionally the server-owned camera), then reloads.
const scatter = async (page: Page, camera?: { x: number; y: number; zoom: number }) => {
  for (const [id, position] of Object.entries(scattered)) {
    await page.request.patch(`/api/nodes/${id}`, { data: { position } });
  }
  if (camera) await page.request.patch("/api/burrows/demo", { data: { viewport: camera } });
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);
};

// Cameras that frame the whole scatter (its painted size, not the seed size), so
// no card is cut at the fold and every edge is in shot.
const DESKTOP_CAMERA = { x: 308, y: 0, zoom: 0.85 };
const PHONE_CAMERA = { x: -8, y: 100, zoom: 0.52 };

test.beforeEach(async ({ page }) => {
  resetDemoBurrow();
  await open(page);
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

  await expect.poll(() => viewportTransform(page)).not.toBe(before);

  const panScale = (await viewportMatrix(page)).scale;
  await page.getByRole("button", { name: "Zoom in" }).click();
  // The toolbar animates the zoom, so poll instead of reading once.
  await expect
    .poll(async () => (await viewportMatrix(page)).scale)
    .toBeGreaterThan(panScale);
});

test("cards line up wide without overlap", async ({ page }) => {
  const boxes = await Promise.all(
    fixtureNodes.map((node) =>
      page.locator(`.react-flow__node[data-id="${node.id}"]`).boundingBox(),
    ),
  );
  if (boxes.some((box) => !box)) throw new Error("missing node box");
  const row = boxes as { x: number; y: number; width: number }[];

  // Relaxed default: one wide row, left to right, nothing stacked.
  for (const box of row) expect(Math.abs(box.y - row[0].y)).toBeLessThan(1);
  const sorted = [...row].sort((a, b) => a.x - b.x);
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

test("edges leave the source card's right edge", async ({ page }) => {
  await expect(page.locator(".react-flow__edge")).toHaveCount(3);

  const geometry = await page.evaluate(() => {
    const node = document.querySelector('.react-flow__node[data-id="node_root"]') as HTMLElement;
    const path = document.querySelector(".react-flow__edge-path") as SVGPathElement | null;
    const matrix = path?.getScreenCTM();
    if (!node || !path || !matrix) throw new Error("missing edge");
    const start = path.getPointAtLength(0);
    const point = new DOMPoint(start.x, start.y).matrixTransform(matrix);
    const rect = node.getBoundingClientRect();
    return { x: point.x, y: point.y, rect: { top: rect.top, bottom: rect.bottom, right: rect.right } };
  });

  // The parent's source handle is on its right border, mid-height; a stale
  // measurement leaves the edge drawing inside the card, where the body hides it.
  expect(Math.abs(geometry.x - geometry.rect.right)).toBeLessThan(8);
  expect(geometry.y).toBeGreaterThan(geometry.rect.top);
  expect(geometry.y).toBeLessThan(geometry.rect.bottom);
});

test("edges follow cards that are not in a row", async ({ page }) => {
  // Two columns, no shared row, and the longest card in the middle: the header
  // anchors must route each edge wherever the cards sit.
  await scatter(page, DESKTOP_CAMERA);

  const pairs = fixtureNodes.flatMap((node) =>
    node.parentId ? [{ parentId: node.parentId, childId: node.id }] : [],
  );
  const routed = await page.evaluate((pairs) => {
    const box = (id: string) => {
      const node = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"]`)!;
      const rect = node.getBoundingClientRect();
      const head = node.querySelector(".db-card-head")!.getBoundingClientRect();
      return { left: rect.left, right: rect.right, head: head.top + head.height / 2 };
    };

    return pairs.map(({ parentId, childId }) => {
      const path = document.querySelector<SVGPathElement>(
        `.react-flow__edge[data-id="${parentId}-${childId}"] .react-flow__edge-path`,
      )!;
      const matrix = path.getScreenCTM()!;
      const at = (length: number) => {
        const point = path.getPointAtLength(length);
        return new DOMPoint(point.x, point.y).matrixTransform(matrix);
      };
      return {
        start: at(0),
        end: at(path.getTotalLength()),
        parent: box(parentId),
        child: box(childId),
      };
    });
  }, pairs);

  expect(routed).toHaveLength(3);
  for (const { start, end, parent, child } of routed) {
    expect(Math.abs(start.x - parent.right)).toBeLessThan(2);
    expect(Math.abs(start.y - parent.head)).toBeLessThan(3);
    expect(Math.abs(end.x - child.left)).toBeLessThan(2);
    expect(Math.abs(end.y - child.head)).toBeLessThan(3);
  }

  await expect(page.getByTestId("canvas")).toHaveScreenshot("scattered-edges.png", {
    animations: "disabled",
  });
});

test("stable visuals", async ({ page }) => {
  // Whole viewport, relaxed default positions, no dragging first.
  await expect(page).toHaveScreenshot("canvas.png", { animations: "disabled" });
});

const { defaultBrowserType: _browser, ...iphone13 } = devices["iPhone 13"];

test.describe("mobile", () => {
  test.use(iphone13);

  test("stable visuals", async ({ page }) => {
    await expect(page).toHaveScreenshot("canvas-mobile.png", { animations: "disabled" });
  });

  // The scatter is wider than the phone, so the camera is pulled back until the
  // whole shape — and every edge — is in frame.
  test("scattered edges stay attached when zoomed out", async ({ page }) => {
    await scatter(page, PHONE_CAMERA);
    await expect(page.getByTestId("canvas")).toHaveScreenshot("scattered-edges-mobile.png", {
      animations: "disabled",
    });
  });
});
