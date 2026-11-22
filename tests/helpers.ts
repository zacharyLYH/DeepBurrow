import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";
import { demoCredentials, fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";
import type { Node as BurrowNode } from "../packages/types/src/types.ts";
import { latestCode } from "./mock-smtp.ts";

export const baseCount = fixtureNodes.length;
export const rootId = fixtureNodes[0].id;

export const cards = (page: Page) => page.locator('[data-testid^="card-"]');
export const card = (page: Page, id: string) => page.getByTestId(`card-${id}`);

export async function burrowNodes(page: Page): Promise<BurrowNode[]> {
  const response = await page.request.get(`/api/burrows/${fixtureBurrow.id}`);
  return ((await response.json()) as { nodes: BurrowNode[] }).nodes;
}

const login = async (request: APIRequestContext) => {
  const email = demoCredentials.email;
  expect((await request.post("/api/auth/email", { data: { email } })).status()).toBe(202);
  const code = await latestCode(email);
  const response = await request.post("/api/auth/verify", { data: { email, code } });
  expect(response.ok()).toBe(true);
};

export async function signIn(page: Page) {
  await login(page.request);
}

export async function signInContext(context: BrowserContext) {
  await login(context.request);
}

export async function open(page: Page, count = baseCount) {
  await signIn(page);
  await page.goto("/app");
  await expect(page.locator(".react-flow__node")).toHaveCount(count);
  // One edge per non-root node, anchored to the card's DOM handles.
  await expect(page.locator(".react-flow__edge")).toHaveCount(count - 1);
  // Viewport restore and the first stream of fixtures settle.
  await page.waitForTimeout(300);
}

type Mutations = Map<string, number>;

// Counts DOM changes per card, so a stream can prove it repainted one card only.
export async function watchCards(page: Page) {
  await page.evaluate(() => {
    const counts: Mutations = new Map();
    (window as Window & { __cardMutations?: Mutations }).__cardMutations = counts;
    new MutationObserver((records) => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        const id = target?.closest<HTMLElement>("[data-card-id]")?.dataset.cardId;
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}

export async function mutatedCards(page: Page) {
  return page.evaluate(() =>
    [...((window as Window & { __cardMutations?: Mutations }).__cardMutations ?? new Map())].map(
      ([id]) => id,
    ),
  );
}

export async function openDrawer(target: Locator) {
  await target.locator('[data-testid^="drawer-handle-"]').click();
  const input = target.locator('[data-testid^="drawer-input-"]');
  await expect(input).toBeFocused();
  return input;
}

// Asks from a card's drawer and returns the new card.
export async function ask(page: Page, text: string, parentId = rootId) {
  const before = await cards(page).count();
  const input = await openDrawer(card(page, parentId));
  await input.fill(text);
  await input.press("Enter");
  await expect(cards(page)).toHaveCount(before + 1);
  return cards(page).last();
}

export const viewportMatrix = (page: Page) =>
  page.locator(".react-flow__viewport").evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f, scale: matrix.a };
  });

export async function jump(page: Page, query: string) {
  await page.getByTestId("open-palette").tap();
  await page.getByTestId("palette-input").fill(query);
  await expect(page.getByTestId("palette-row-0")).toBeVisible();
  await page.getByTestId("palette-row-0").tap();
  await expect(page.getByTestId("palette")).toHaveCount(0);
  await page.waitForTimeout(400);
}

export async function menu(page: Page, id: string) {
  await page.getByTestId(`menu-${id}`).click();
  return page.getByTestId(`menu-panel-${id}`);
}

export async function drag(
  page: Page,
  from: { x: number; y: number },
  dx: number,
  dy: number,
  modifiers: string[] = [],
) {
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 12 });
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

export async function head(page: Page, id = rootId) {
  const box = await card(page, id).locator(".db-card-head").boundingBox();
  if (!box) throw new Error("no head");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Selection is the ask path on both desktop and touch; a real long-press and a
// mouse drag both end in one selectionchange, which is what this drives.
export async function selectPassage(page: Page, id: string, length = 42) {
  return page.evaluate(
    ({ id, length }) => {
      const host = document.querySelector(`[data-card-id="${id}"]`);
      const paragraph = host?.querySelector(".db-markdown p");
      const textNode = paragraph?.firstChild;
      if (!textNode?.textContent) throw new Error("no selectable text");
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, Math.min(length, textNode.textContent.length));
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return textNode.textContent.slice(0, Math.min(length, textNode.textContent.length));
    },
    { id, length },
  );
}
