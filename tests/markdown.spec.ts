import { expect, test } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { ask, cards, open } from "./helpers.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.beforeEach(() => resetDemoBurrow());

const rich = async (page: import("@playwright/test").Page) => {
  await open(page);
  // zzmd makes the HTTP mock provider emit every renderer block.
  const card = await ask(page, "zzmd render everything");
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 20000 });
  return card;
};

test("renders GFM, code, math, Mermaid and images", async ({ page }) => {
  const card = await rich(page);

  await expect(card.locator(".db-markdown h2")).toHaveText("Signals");
  await expect(card.locator(".db-markdown ul").first().locator("li")).toHaveCount(3);

  // GFM table
  await expect(card.locator("table tbody tr")).toHaveCount(2);
  // A wide table scrolls inside its own container instead of clipping.
  const table = card.locator("table").first();
  expect(
    await table.evaluate((element) => {
      const cell = element.querySelector("td") as HTMLElement;
      cell.style.whiteSpace = "nowrap";
      cell.textContent = "x".repeat(120);
      return element.scrollWidth > element.clientWidth;
    }),
  ).toBe(true);
  // Task list
  const boxes = card.locator('input[type="checkbox"]');
  await expect(boxes).toHaveCount(2);
  await expect(boxes.first()).toBeChecked();
  // Strikethrough and inline code
  await expect(card.locator("del")).toHaveText("dropped");
  await expect(card.locator("code.db-inline-code")).toHaveText("inline code");

  // Fenced code with copy
  const code = card.getByTestId("code-block").first();
  await expect(code).toContainText("const window");
  await code.getByRole("button", { name: "Copy" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("const window");

  // KaTeX
  await expect(card.locator(".katex").first()).toBeVisible();

  // Mermaid: the block renders itself, never as raw HTML.
  await expect(card.getByTestId("mermaid")).toBeVisible();
  // Wait for the async render, otherwise the diagram's height lands mid-click
  // and the image below it shifts away from the pointer.
  await expect(card.locator(".db-mermaid svg")).toBeVisible();

  // Image + lightbox
  const image = card.locator(".db-image img");
  await expect
    .poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
  // A drag that starts and ends on the image is not a tap: no lightbox.
  const imageBox = await card.locator(".db-image").boundingBox();
  if (!imageBox) throw new Error("no image");
  await page.mouse.move(imageBox.x + 10, imageBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(imageBox.x + 40, imageBox.y + 16, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId("lightbox")).toHaveCount(0);

  await card.locator(".db-image").click();
  await expect(page.getByTestId("lightbox")).toBeVisible();
  await page.getByTestId("close-lightbox").click();
  await expect(page.getByTestId("lightbox")).toHaveCount(0);

  // Links open in a new tab with rel
  const link = card.locator("a.db-link").first();
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noreferrer");
});

test("raw HTML and unsafe URLs stay inert", async ({ page }) => {
  const card = await rich(page);

  // No raw HTML means the script tag is text, not an element.
  await expect(card.locator("script")).toHaveCount(0);
  await expect(card.locator(".db-markdown")).toContainText("<script>");

  const images = await card.locator(".db-image img").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("src") ?? ""),
  );
  for (const src of images) expect(src.startsWith("https://") || src.startsWith("/")).toBe(true);
});

test("partial Markdown renders while streaming without throwing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await open(page);
  const card = await ask(page, "zzmd stream partial");

  // Text arrives before the answer settles, and the body keeps rendering.
  await expect(card.locator('[data-testid^="body-"]')).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "answered", { timeout: 20000 });
  await expect(card.locator(".db-markdown h2")).toHaveText("Signals");

  expect(errors).toEqual([]);
  expect(await cards(page).count()).toBe(5);
});
