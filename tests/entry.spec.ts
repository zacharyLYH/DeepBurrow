import { expect, test } from "@playwright/test";
import { fixtureBurrow } from "../packages/types/src/fixtures.ts";
import { resetDemoBurrow } from "./db.ts";
import { burrowNodes, cards, open, signIn } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

// An empty burrow is a load with no nodes; the server still owns the write.
const emptyBurrow = async (page: import("@playwright/test").Page) => {
  await page.route(`**/api/burrows/${fixtureBurrow.id}`, (route) =>
    route.fulfill({ json: { burrow: fixtureBurrow, nodes: [] } }),
  );
};

test("empty burrow shows one composer and submits a root card", async ({ page }) => {
  await emptyBurrow(page);
  await signIn(page);
  await page.goto("/");

  await expect(page.getByTestId("entry-composer")).toBeVisible();
  await expect(cards(page)).toHaveCount(0);

  await page.getByTestId("entry-input").fill("What is the root question?");
  await page.getByTestId("entry-submit").click();

  await expect(cards(page)).toHaveCount(1);
  const root = cards(page).first();
  await expect(root).toHaveAttribute("data-root", "true");
  await expect(root).toHaveAttribute("data-status", "answered", { timeout: 15000 });
  await expect(page.getByTestId("entry-composer")).toHaveCount(0);

  // The row really is a root: no parent on the server.
  const nodes = await burrowNodes(page);
  const created = nodes.find((node) => node.origin.question === "What is the root question?");
  expect(created?.parentId).toBeNull();

  // The first card of an empty burrow becomes the frame: no restored camera
  // exists, so it must not arrive in the corner.
  const viewport = page.viewportSize()!;
  const box = await root.boundingBox();
  if (!box) throw new Error("no card box");
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(80);
  expect(Math.abs(box.y + box.height / 2 - viewport.height / 2)).toBeLessThan(80);
});

test("a loaded burrow never shows the composer", async ({ page }) => {
  await open(page);
  await expect(page.getByTestId("entry-composer")).toHaveCount(0);
});
