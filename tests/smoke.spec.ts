import { expect, test } from "@playwright/test";
import { fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";

test("renders a fixture burrow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("canvas")).toBeVisible();
  await expect(page.getByTestId("burrow-title")).toHaveText(fixtureBurrow.title);
  await expect(page.getByTestId(`card-${fixtureNodes[0].id}`)).toBeVisible();
  await expect(page.getByTestId(`card-${fixtureNodes[1].id}`)).toBeVisible();
});
