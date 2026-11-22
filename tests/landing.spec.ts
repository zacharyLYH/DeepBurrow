import { expect, test } from "@playwright/test";
import { signIn } from "./helpers.ts";

test("signed-out visitors see the public landing page and its sign-in links", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByTestId("auth-screen")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Deep research with AI the smarter way",
  );
  await expect(page.getByTestId("install-ios")).toContainText("Add to Home Screen");
  await expect(page.getByTestId("install-android")).toContainText("Install app");

  const desktop = page.getByTestId("walkthrough-desktop-video");
  const mobile = page.getByTestId("walkthrough-mobile-video");
  await expect(desktop).toBeVisible();
  await expect(mobile).toBeVisible();

  for (const [video, source, captions] of [
    [desktop, "/walkthrough-desktop.webm", "/walkthrough-desktop.vtt"],
    [mobile, "/walkthrough-mobile.webm", "/walkthrough-mobile.vtt"],
  ] as const) {
    await expect(video).toHaveAttribute("controls", "");
    expect(
      await video.evaluate(
        (element: HTMLVideoElement) => element.autoplay && element.loop && element.muted,
      ),
    ).toBe(true);
    await expect(video.locator("source")).toHaveAttribute("src", source);
    await expect(video.locator("track")).toHaveAttribute("src", captions);
    await expect(video.locator("track")).toHaveAttribute("kind", "captions");
  }

  await expect(page.getByTestId("landing-signup")).toHaveAttribute("href", "/sign-in");
  await expect(page.getByTestId("landing-signin")).toHaveAttribute("href", "/sign-in");
  await page.getByTestId("landing-signin").click();
  await expect(page.getByTestId("auth-screen")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/sign-in");
});

test("sign-in and workspace link back to the landing page", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByTestId("auth-home")).toHaveAttribute("href", "/");
  await page.getByTestId("auth-home").click();
  await expect(page.getByTestId("landing")).toBeVisible();

  await signIn(page);
  await page.goto("/app");
  await expect(page.getByTestId("open-home")).toHaveAttribute("href", "/");
});

test("landing fits a phone without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByTestId("walkthrough-desktop")).toBeVisible();
  await expect(page.getByTestId("walkthrough-mobile")).toBeVisible();
  await expect(page.getByTestId("install-ios")).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("signed-in visitors stay on the landing page and can open the workspace", async ({ page }) => {
  await signIn(page);
  await page.goto("/");

  await expect(page.getByTestId("landing")).toBeVisible();
  await expect(page.getByTestId("app")).toHaveCount(0);
  await expect(page.getByTestId("open-workspace")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/");
});

test("sign-in sends a signed-in visitor to the workspace", async ({ page }) => {
  await signIn(page);
  await page.goto("/sign-in");

  await expect(page.getByTestId("workspace")).toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/app");
});

test("metadata, sitemap, robots and production assets are published", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/DeepBurrow/);
  const content = (selector: string) => page.locator(selector).getAttribute("content");
  expect(await content('meta[name="description"]')).toContain("branch");
  expect(await content('meta[name="robots"]')).toBe("index,follow");
  expect(await content('meta[property="og:title"]')).toContain("DeepBurrow");
  expect(await content('meta[property="og:image"]')).toBe(
    "https://deepburrow.dev/walkthrough-desktop-poster.png",
  );
  expect(await content('meta[name="twitter:card"]')).toBe("summary_large_image");
  expect(await page.locator('link[rel="canonical"]').getAttribute("href")).toBe(
    "https://deepburrow.dev/",
  );

  const robots = await page.request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap: https://deepburrow.dev/sitemap.xml");

  const sitemap = await page.request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("<loc>https://deepburrow.dev/</loc>");

  for (const asset of [
    "/walkthrough-desktop.webm",
    "/walkthrough-desktop.vtt",
    "/walkthrough-desktop-poster.png",
    "/walkthrough-mobile.webm",
    "/walkthrough-mobile.vtt",
    "/walkthrough-mobile-poster.png",
    "/favicon.png",
  ]) {
    expect((await page.request.get(asset)).ok(), asset).toBe(true);
  }
});
