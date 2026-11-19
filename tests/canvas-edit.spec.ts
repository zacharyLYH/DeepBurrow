import { expect, test } from "@playwright/test";
import { fixtureBurrow } from "../packages/types/src/fixtures.ts";
import { readNodeRow, readViewport, resetDemoBurrow } from "./db.ts";
import { card, drag, head, open, rootId, viewportMatrix } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

test("dragging a head moves only that card and writes its position", async ({ page }) => {
  await open(page);
  const before = await card(page, rootId).boundingBox();
  const otherBefore = await card(page, "node_why").boundingBox();
  if (!before || !otherBefore) throw new Error("no card");

  await drag(page, await head(page, rootId), 70, 50);

  const after = await card(page, rootId).boundingBox();
  const otherAfter = await card(page, "node_why").boundingBox();
  if (!after || !otherAfter) throw new Error("no card");
  expect(after.x - before.x).toBeGreaterThan(40);
  expect(after.y - before.y).toBeGreaterThan(20);
  expect(otherAfter.x).toBeCloseTo(otherBefore.x, 0);

  // Flow coordinates go to the DB unchanged.
  await expect.poll(() => readNodeRow(rootId)?.position_x).toBeGreaterThan(30);
});

test("position and camera survive a reload", async ({ page }) => {
  await open(page);
  await drag(page, await head(page, rootId), 90, 70);
  await expect.poll(() => readNodeRow(rootId)?.position_x).toBeGreaterThan(40);

  const pane = await page.locator(".react-flow__pane").boundingBox();
  if (!pane) throw new Error("no pane");
  await drag(page, { x: pane.x + 60, y: pane.y + pane.height - 80 }, -150, 40);

  await expect.poll(() => readViewport().x).not.toBe(fixtureBurrow.viewport.x);
  await page.waitForTimeout(500);
  const saved = readViewport();
  const savedPosition = readNodeRow(rootId)!;

  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);

  // No fit-on-load: the stored camera comes back verbatim.
  await expect.poll(async () => (await viewportMatrix(page)).x).toBeCloseTo(saved.x, 0);
  const matrix = await viewportMatrix(page);
  expect(matrix.y).toBeCloseTo(saved.y, 0);
  expect(matrix.scale).toBeCloseTo(saved.zoom, 2);

  // And the card sits where the server put it.
  const { nodes } = (await (await page.request.get(`/api/burrows/${fixtureBurrow.id}`)).json()) as {
    nodes: { id: string; position: { x: number; y: number } }[];
  };
  const root = nodes.find((node) => node.id === rootId);
  expect(root?.position.x).toBeCloseTo(savedPosition.position_x, 1);
  expect(root?.position.y).toBeCloseTo(savedPosition.position_y, 1);
});

test("shift-drag carries the branch", async ({ page }) => {
  await open(page);
  const childBefore = await card(page, "node_why").boundingBox();
  if (!childBefore) throw new Error("no card");

  await drag(page, await head(page, rootId), 80, 0, ["Shift"]);

  const childAfter = await card(page, "node_why").boundingBox();
  if (!childAfter) throw new Error("no card");
  expect(childAfter.x - childBefore.x).toBeGreaterThan(50);
});

test("cards size to content and have no resize handle", async ({ page }) => {
  await open(page);
  await expect(card(page, rootId).getByTestId(`resize-${rootId}`)).toHaveCount(0);

  const short = await card(page, rootId).boundingBox();
  const long = await card(page, "node_long").boundingBox();
  if (!short || !long) throw new Error("no card");
  expect(long.height).toBeGreaterThan(short.height + 40);
});

// React Flow's auto-pan is the only thing that lets a drag reach past the edge.
test("dragging a card against the edge pans the camera", async ({ page }) => {
  await open(page);
  const before = await viewportMatrix(page);
  const from = await head(page, rootId);

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 12 });
  // Hold inside the edge zone: auto-pan repeats on animation frames.
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(8 + (i % 2), 8, { steps: 2 });
    await page.waitForTimeout(50);
  }
  const during = await viewportMatrix(page);
  await page.mouse.up();

  expect(Math.abs(during.x - before.x) + Math.abs(during.y - before.y)).toBeGreaterThan(20);
});
