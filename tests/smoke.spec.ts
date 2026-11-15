import { expect, test } from "@playwright/test";
import { fixtureHole, fixtureNodes } from "../packages/types/src/fixtures.ts";

test("renders a fixture hole", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: fixtureHole.title, level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: fixtureNodes[0].title, level: 2 })).toBeVisible();
  await expect(page.getByText(fixtureNodes[0].markdown)).toBeVisible();
});
