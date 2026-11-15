import { expect, test } from "@playwright/test";
import { fixtureHole, fixtureNodes } from "../packages/types/src/fixtures.ts";

test("renders a fixture hole", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.getByTestId("hole-title")).toHaveText(fixtureHole.title);
  await expect(page.getByTestId(`card-${fixtureNodes[0].id}`)).toBeVisible();
  await expect(page.getByTestId(`card-${fixtureNodes[1].id}`)).toBeVisible();
});
