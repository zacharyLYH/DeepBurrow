import { devices, expect, test, type Page } from "@playwright/test";
import { resetDemoBurrow } from "./db.ts";
import { signIn } from "./helpers.ts";

test.beforeEach(async ({ page }) => {
  resetDemoBurrow();
  await signIn(page);
});

const openInstall = async (page: Page) => {
  await page.goto("/app");
  await page.getByTestId("open-settings").click();
  await page.getByTestId("settings-section-install").click();
};

test("desktop points to the browser install menu", async ({ page }) => {
  await openInstall(page);
  await expect(page.getByTestId("install-steps")).toContainText("phone");
});

const { defaultBrowserType: _iphoneBrowser, ...iphone13 } = devices["iPhone 13"];

test.describe("iPhone", () => {
  test.use(iphone13);

  test("shows Safari share steps", async ({ page }) => {
    await openInstall(page);
    const steps = page.getByTestId("install-steps");
    await expect(steps).toContainText("Safari");
    await expect(steps).toContainText("Share");
    await expect(steps).toContainText("Add to Home Screen");
  });
});

const { defaultBrowserType: _pixelBrowser, ...pixel } = devices["Pixel 7"];

test.describe("Android", () => {
  test.use(pixel);

  test("shows Chrome menu steps", async ({ page }) => {
    await openInstall(page);
    const steps = page.getByTestId("install-steps");
    await expect(steps).toContainText("Chrome");
    await expect(steps).toContainText("Install app");
  });
});
