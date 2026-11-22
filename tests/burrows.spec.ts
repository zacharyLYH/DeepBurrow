import { expect, test } from "@playwright/test";
import { fixtureBurrow, fixtureBurrows } from "../packages/types/src/fixtures.ts";
import type { Burrow } from "../packages/types/src/types.ts";
import { resetDemoBurrow } from "./db.ts";
import { cards, open } from "./helpers.ts";
import { latestCode } from "./mock-smtp.ts";

test.beforeEach(() => resetDemoBurrow());

const list = (page: import("@playwright/test").Page) => page.getByTestId("burrow-list");
const row = (page: import("@playwright/test").Page, title: string) =>
  list(page).getByRole("button", { name: title, exact: true });

const startBurrow = async (page: import("@playwright/test").Page, question: string) => {
  await page.getByTestId("new-burrow").click();
  await expect(page.getByTestId("new-burrow-dialog")).toBeVisible();
  await page.getByTestId("new-burrow-input").fill(question);
  await page.getByTestId("new-burrow-submit").click();
};

test("lists, starts a burrow, switches and remembers the selected burrow", async ({ page }) => {
  await open(page);
  await expect(list(page).locator('[data-testid^="burrow-row-"]')).toHaveCount(fixtureBurrows.length);
  await expect(row(page, fixtureBurrow.title)).toHaveAttribute("aria-current", "page");

  // A new burrow opens on its first question, already sending.
  await startBurrow(page, "  What is a signal?  ");
  await expect(page.getByTestId("new-burrow-dialog")).toHaveCount(0);
  await expect(row(page, "What is a signal?")).toHaveAttribute("aria-current", "page");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute("data-status", "answered", { timeout: 15000 });

  // Duplicate titles are rejected case-insensitively, never silently renamed.
  await startBurrow(page, "what is a signal?");
  await expect(page.getByTestId("new-burrow-error")).toContainText(
    "A burrow with that title already exists",
  );
  await expect(page.getByTestId("new-burrow-dialog")).toBeVisible();
  await expect(list(page).locator('[data-testid^="burrow-row-"]')).toHaveCount(
    fixtureBurrows.length + 1,
  );
  await page.keyboard.press("Escape");

  // Switching loads that burrow's cards; the selection survives a reload.
  await row(page, fixtureBurrow.title).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await page.reload();
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.getByTestId("burrow-title")).toHaveText(fixtureBurrow.title);

  await row(page, "What is a signal?").click();
  await expect(cards(page)).toHaveCount(1);
  await page.reload();
  await expect(cards(page)).toHaveCount(1);
  await expect(row(page, "What is a signal?")).toHaveAttribute("aria-current", "page");
});

test("the first message is a root card in the new burrow", async ({ page }) => {
  await open(page);
  await startBurrow(page, "What is a signal?");
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toHaveAttribute("data-status", "answered", { timeout: 15000 });

  const selected = await list(page)
    .locator('[aria-current="page"]')
    .getAttribute("data-testid");
  const id = selected!.replace("burrow-row-", "");
  const view = (await (await page.request.get(`/api/burrows/${id}`)).json()) as {
    nodes: { parentId: string | null; origin: { question: string } }[];
  };
  expect(view.nodes).toHaveLength(1);
  expect(view.nodes[0].parentId).toBeNull();
  expect(view.nodes[0].origin.question).toBe("What is a signal?");
});

test("renames a burrow and rejects a case-only duplicate", async ({ page }) => {
  await open(page);
  const id = "burrow_second";

  await page.getByTestId(`burrow-menu-${id}`).click();
  await page.getByTestId(`burrow-rename-${id}`).click();
  const input = page.getByTestId(`rename-burrow-${id}`);
  await input.fill("QUIC deep dive");
  await input.press("Enter");
  await expect(row(page, "QUIC deep dive")).toBeVisible();

  // Case-only duplicates conflict against another burrow of the same user.
  await page.getByTestId(`burrow-menu-${id}`).click();
  await page.getByTestId(`burrow-rename-${id}`).click();
  await page.getByTestId(`rename-burrow-${id}`).fill("tcp CONGESTION control");
  await page.getByTestId(`rename-burrow-${id}`).press("Enter");
  await expect(page.getByText("A burrow with that title already exists")).toBeVisible();
  await expect(page.getByTestId(`rename-burrow-${id}`)).toHaveValue("tcp CONGESTION control");
  await page.getByTestId(`rename-burrow-${id}`).press("Escape");
  await expect(row(page, "QUIC deep dive")).toBeVisible();

  const saved = (await (await page.request.get("/api/burrows")).json()) as { burrows: Burrow[] };
  expect(saved.burrows.find((burrow) => burrow.id === id)?.title).toBe("QUIC deep dive");
});

test("another user's burrows never appear in the list", async ({ page }) => {
  const email = `other-${Date.now()}@example.test`;
  expect((await page.request.post("/api/auth/email", { data: { email } })).status()).toBe(202);
  const code = await latestCode(email);
  expect((await page.request.post("/api/auth/verify", { data: { email, code } })).status()).toBe(200);
  // Another user may reuse a title that the demo account already owns.
  const shared = await page.request.post("/api/burrows", { data: { title: fixtureBurrow.title } });
  expect(shared.status()).toBe(201);
  const created = await page.request.post("/api/burrows", {
    data: { title: "Someone else's burrow" },
  });
  expect(created.status()).toBe(201);

  await open(page);
  await expect(list(page).locator('[data-testid^="burrow-row-"]')).toHaveCount(fixtureBurrows.length);
  await expect(page.getByText("Someone else's burrow")).toHaveCount(0);
});
