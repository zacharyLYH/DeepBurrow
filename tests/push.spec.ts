import { expect, test, type Page } from "@playwright/test";
import { fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";
import { rootId, signIn } from "./helpers.ts";
import { clearPushEvents, pushEvents, waitForPush } from "./mock-push.ts";
import { resetDemoBurrow } from "./db.ts";

const device = () => `https://push.test/${Date.now()}-${Math.random().toString(16).slice(2)}`;

const subscribe = (page: Page, endpoint: string) =>
  page.request.post("/api/push/subscription", {
    data: { endpoint, p256dh: "p256dh", auth: "auth" },
  });

test.beforeEach(async ({ page }) => {
  resetDemoBurrow();
  await clearPushEvents();
  await signIn(page, { keepPushPrompt: true });
});

test("install metadata and the service worker are published", async ({ page }) => {
  const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as {
    start_url: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest.start_url).toBe("/app");
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
      expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
    ]),
  );

  const html = await (await page.request.get("/")).text();
  expect(html).toContain('rel="manifest"');
  const worker = await (await page.request.get("/sw.js")).text();
  expect(worker).toContain('addEventListener("push"');
  expect(worker).toContain("notificationclick");
});

test("the opt-in prompt is dismissible and settings exposes this device", async ({ page }) => {
  // Chromium headless rejects the real permission prompt; mock only the API
  // the UI reads so the off state is testable.
  await page.addInitScript(() => {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "default", requestPermission: async () => "granted" },
    });
  });
  await page.goto("/app");
  await expect(page.getByTestId("push-prompt")).toBeVisible();
  await page.getByTestId("push-later").click();
  await expect(page.getByTestId("push-prompt")).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId("push-prompt")).toHaveCount(0);
  await page.getByTestId("open-settings").click();
  await page.getByTestId("settings-section-notifications").click();
  await expect(page.getByTestId("push-state")).toContainText(/Off|Not supported|Blocked/);
});

test("a completion link opens its burrow and node", async ({ page }) => {
  const target = fixtureNodes[1];
  await page.goto(`/app?burrow=${fixtureBurrow.id}&node=${target.id}`);
  await expect(page.getByTestId(`card-${target.id}`)).toBeVisible();
});

test("offline explains what needs a connection", async ({ page, context }) => {
  await page.goto("/app");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect(page.getByTestId("workspace")).toBeVisible();
  await context.setOffline(true);
  await expect(page.getByTestId("offline-notice")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "You’re offline" })).toBeVisible();
  await context.setOffline(false);
});

test("a test push reaches only the subscribed device", async ({ page }) => {
  const one = device();
  const two = device();
  expect((await subscribe(page, one)).status()).toBe(201);
  expect((await subscribe(page, two)).status()).toBe(201);

  const testId = `test-${Date.now()}`;
  expect(
    (
      await page.request.post("/api/push/test", {
        data: { endpoint: one, testId },
      })
    ).status(),
  ).toBe(202);

  const push = await waitForPush((item) => item.payload.testId === testId);
  expect(push.endpoint).toBe(one);
  expect(push.payload).toMatchObject({
    title: "DeepBurrow",
    body: "Notifications are working.",
  });
  expect((await pushEvents()).filter((item) => item.endpoint === two)).toHaveLength(0);
});

test("completion sends one generic push after the answer is stored", async ({ page }) => {
  const endpoint = device();
  await subscribe(page, endpoint);

  const answer = await page.request.post("/api/ask", {
    data: { parentId: rootId, origin: { question: "What is TCP?" } },
  });
  expect(answer.ok()).toBe(true);

  const push = await waitForPush((item) => item.payload.burrowId === fixtureBurrow.id);
  expect(push.payload).toMatchObject({
    title: "DeepBurrow",
    body: "Your answer is ready.",
    burrowId: fixtureBurrow.id,
  });
  expect(push.payload.nodeId).toBeTruthy();
  expect(JSON.stringify(push.payload)).not.toContain("What is TCP?");
});

test("unsubscribing removes the device", async ({ page }) => {
  const endpoint = device();
  await subscribe(page, endpoint);

  expect(
    (await page.request.delete("/api/push/subscription", { data: { endpoint } })).status(),
  ).toBe(204);
  expect(
    (await (await page.request.get(`/api/push/status?endpoint=${encodeURIComponent(endpoint)}`)).json()) as {
      subscribed: boolean;
    },
  ).toEqual({ subscribed: false });
  expect(
    (
      await page.request.post("/api/push/test", {
        data: { endpoint },
      })
    ).status(),
  ).toBe(404);
});
