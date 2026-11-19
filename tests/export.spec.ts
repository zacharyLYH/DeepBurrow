import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { fixtureNodes } from "../packages/types/src/fixtures.ts";
import { resetDemoBurrow } from "./db.ts";
import { ask, open } from "./helpers.ts";

test.beforeEach(() => resetDemoBurrow());

const exportHtml = async (page: Page, name: string) => {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const path = test.info().outputPath(name);
  await download.saveAs(path);
  return { path, html: await readFile(path, "utf8") };
};

const loadExport = async (page: Page, path: string, count = fixtureNodes.length) => {
  await page.goto(pathToFileURL(path).href);
  await expect(page.locator("html")).toHaveClass(/db-js/);
  await expect(page.locator(".react-flow__node")).toHaveCount(count);
  await page.evaluate(() => document.fonts.ready.then(() => true));
};

const absentChrome = (html: string) => {
  expect(html).not.toContain('data-testid="toolbar"');
  expect(html).not.toContain('data-testid="menu-');
  expect(html).not.toContain('data-testid="chip-');
  expect(html).not.toContain("Copy as Markdown");
  expect(html).not.toContain("Ask follow-up");
  expect(html).not.toMatch(/class="[^"]*react-flow__handle/);
  expect(html).not.toMatch(/class="[^"]*react-flow__background/);
  expect(html).not.toContain("<link");
};

test("export downloads a standalone readable document", async ({ page }) => {
  await open(page);
  const { path, html } = await exportHtml(page, "burrow.html");

  for (const node of fixtureNodes) expect(html).toContain(node.title);
  expect(html).toContain('href="https://www.rfc-editor.org/rfc/rfc5681"');
  expect(html).toContain('<html lang="en" data-theme="light">');
  expect(html).toContain("<style>");
  absentChrome(html);

  // The optional controls are one self-contained inline script.
  expect(html).toContain('<script>\n');
  expect(html).not.toMatch(/<script[^>]+src=/);
  await loadExport(page, path);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page).toHaveScreenshot("export-light.png", { animations: "disabled", fullPage: true });

  const body = page.locator('[data-testid^="body-"]').first();
  const before = await body.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "Increase text size" }).click();
  const after = await body.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(after).toBeGreaterThan(before);

  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("120%");
  expect(await page.locator(".react-flow__viewport").evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(1.2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeGreaterThan(width);
  await page.getByRole("button", { name: "Reset zoom" }).click();
  await expect(page.getByRole("button", { name: "Reset zoom" })).toHaveText("100%");

  await page.getByRole("button", { name: "Toggle theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page).toHaveScreenshot("export-dark.png", { animations: "disabled", fullPage: true });
});

test("sparse export keeps every card and grows the page instead of fitting", async ({ page }) => {
  const spread = {
    node_root: { x: 0, y: 0 },
    node_why: { x: 1500, y: 0 },
    node_cubic: { x: 0, y: 1000 },
    node_long: { x: 1500, y: 1000 },
  };
  for (const [id, position] of Object.entries(spread)) {
    await page.request.patch(`/api/nodes/${id}`, { data: { position } });
  }
  await open(page);
  const { path, html } = await exportHtml(page, "sparse.html");

  for (const node of fixtureNodes) expect(html).toContain(node.title);
  absentChrome(html);
  expect(html).toMatch(/transform: translate\([-\d.]+px, [-\d.]+px\) scale\(1\)/);

  await page.goto(pathToFileURL(path).href);
  const size = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }));
  expect(size.width).toBeGreaterThan(1280);
  expect(size.height).toBeGreaterThan(800);
  await expect(page).toHaveScreenshot("export-sparse.png", { animations: "disabled", fullPage: true });
});

test("rich export keeps diagrams, math, media and the lightbox", async ({ page }) => {
  await open(page);
  const rich = await ask(page, "zzmd render everything");
  await expect(rich).toHaveAttribute("data-status", "answered", { timeout: 20_000 });
  await expect(rich.getByTestId("mermaid")).toBeVisible();
  await expect(rich.locator(".katex").first()).toBeVisible();

  const { path, html } = await exportHtml(page, "rich.html");
  expect(html).toContain(`src="${new URL("/diagram.svg", page.url()).href}"`);
  absentChrome(html);
  await loadExport(page, path, fixtureNodes.length + 1);
  await expect(page.locator(".db-mermaid svg")).toBeVisible();
  await expect(page.locator(".katex").first()).toBeVisible();
  await expect(page.locator(".db-image img")).toBeVisible();
  await expect
    .poll(() => page.locator(".db-image img").evaluate((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))
    .toBe(true);
  await expect(page).toHaveScreenshot("export-rich.png", { animations: "disabled", fullPage: true });

  await page.locator(".db-image").click();
  await expect(page.locator("#db-export-lightbox")).toBeVisible();
  await expect(page).toHaveScreenshot("export-lightbox.png", { animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#db-export-lightbox")).toBeHidden();
});
