import { expect, test } from "@playwright/test";
import { readNodeRow, readViewport, resetDemoBurrow } from "./db.ts";
import { card, drag, head, open, rootId, signInContext, viewportMatrix } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

test("a drag writes flow coordinates that stay put across reloads", async ({ page }) => {
  await open(page);
  const before = await card(page, rootId).boundingBox();
  if (!before) throw new Error("no card");

  await drag(page, await head(page), 90, 60);
  const after = await card(page, rootId).boundingBox();
  if (!after) throw new Error("no card");
  expect(after.x - before.x).toBeGreaterThan(50);

  // Flow coordinates are what the DB holds: not screen pixels.
  await expect.poll(() => readNodeRow(rootId)?.position_x ?? 0).toBeGreaterThan(50);
  const saved = readNodeRow(rootId)!;
  expect(saved.position_y).toBeGreaterThan(20);

  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const reloaded = await card(page, rootId).boundingBox();
  if (!reloaded) throw new Error("no card");

  // Same camera + same flow position ⇒ same box, with no fit-on-load. React
  // Flow re-measures on mount, so allow a couple of sub-pixel points.
  expect(Math.abs(reloaded.x - after.x)).toBeLessThan(6);
  expect(Math.abs(reloaded.y - after.y)).toBeLessThan(6);
  expect(readNodeRow(rootId)!.position_x).toBeCloseTo(saved.position_x, 2);

  // A second reload is identical: nothing drifts.
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  const again = await card(page, rootId).boundingBox();
  // Still static on the second load: no drift beyond the node re-measure.
  expect(Math.abs(again!.x - reloaded.x)).toBeLessThan(4);
  expect(Math.abs(again!.y - reloaded.y)).toBeLessThan(4);
});

test("the shared camera is written on move end and restored verbatim", async ({ page }) => {
  await open(page);
  const start = readViewport();

  const pane = await page.locator(".react-flow__pane").boundingBox();
  if (!pane) throw new Error("no pane");
  await drag(page, { x: pane.x + 60, y: pane.y + pane.height - 90 }, -160, 50);

  await expect.poll(() => readViewport().x).not.toBe(start.x);
  await page.waitForTimeout(500);
  const saved = readViewport();

  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect.poll(async () => (await viewportMatrix(page)).x).toBeCloseTo(saved.x, 0);
  const matrix = await viewportMatrix(page);
  expect(matrix.y).toBeCloseTo(saved.y, 0);
  expect(matrix.scale).toBeCloseTo(saved.zoom, 2);
});

// Nothing is kept in the browser: a clean context must land on the same camera.
test("a clean browser lands on the stored camera with no local state", async ({ page, browser }) => {
  await open(page);
  const start = readViewport();

  const pane = await page.locator(".react-flow__pane").boundingBox();
  if (!pane) throw new Error("no pane");
  await drag(page, { x: pane.x + 60, y: pane.y + pane.height - 90 }, -150, 60);
  await expect.poll(() => readViewport().x).not.toBe(start.x);
  await page.waitForTimeout(500);
  const saved = readViewport();

  const context = await browser.newContext({ baseURL: "http://localhost:5173" });
  const clean = await context.newPage();
  await signInContext(context);
  await clean.goto("/");
  await expect(clean.locator(".react-flow__node")).toHaveCount(4);

  const matrix = await viewportMatrix(clean);
  expect(matrix.x).toBeCloseTo(saved.x, 0);
  expect(matrix.y).toBeCloseTo(saved.y, 0);
  expect(matrix.scale).toBeCloseTo(saved.zoom, 2);
  expect(await clean.evaluate(() => localStorage.length)).toBe(0);
  await context.close();
});
