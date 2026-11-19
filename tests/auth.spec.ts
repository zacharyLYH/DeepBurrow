import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { digest, signAccess, signRefresh } from "../apps/api/src/security.ts";
import { demoCredentials } from "../packages/types/src/fixtures.ts";
import { readCookies, type CookieJar } from "./api-auth.ts";
import { resetDemoBurrow, TEST_DB_PATH } from "./db.ts";
import { parseEvents } from "./stream.ts";

const API = "http://localhost:8787";
const PASSWORD = "correct horse battery";

test.beforeEach(() => resetDemoBurrow());

const unique = () => `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

type Session = { user: { id: string; email: string }; burrowId: string };
type Auth = { session: Session } & CookieJar;

const call = async (
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    headers?: Record<string, string>;
  } = {},
) =>
  fetch(`${API}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

const authenticate = async (
  path: string,
  email: string,
  password: string,
  status: number,
): Promise<Auth> => {
  const response = await call(path, { method: "POST", body: { email, password } });
  expect(response.status).toBe(status);
  return { session: (await response.json()) as Session, ...readCookies(response.headers) };
};

const signUp = (email = unique(), password = PASSWORD) =>
  authenticate("/auth/sign-up", email, password, 201);

const signIn = (email: string, password: string) =>
  authenticate("/auth/sign-in", email, password, 200);

const askRoot = async (auth: Auth, question: string) => {
  const response = await call("/ask", {
    method: "POST",
    cookie: auth.cookie,
    body: { parentId: null, origin: { question } },
  });
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const events = parseEvents(await response.text());
  const done = events.at(-1);
  if (done?.type !== "node.done") throw new Error("no root answer");
  return done.node;
};

test("signed-out users see auth and can sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("auth-screen")).toBeVisible();
  await page.getByTestId("auth-email").fill(demoCredentials.email);
  await page.getByTestId("auth-password").fill(demoCredentials.password);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-screen")).toHaveCount(0);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.getByTestId("burrow-title")).toHaveText("TCP congestion control");
});

test("failed sign-in attempts are rate limited", async () => {
  const headers = { "x-forwarded-for": "203.0.113.99" };
  const attempt = () =>
    call("/auth/sign-in", {
      method: "POST",
      headers,
      body: { email: "nobody@example.test", password: "not the password" },
    });

  for (let index = 0; index < 10; index++) expect((await attempt()).status).toBe(401);
  expect((await attempt()).status).toBe(429);
});

test("two accounts get separate burrows, settings, nodes and runs", async () => {
  const alice = await signUp();
  const bob = await signUp();
  expect(alice.session.burrowId).not.toBe(bob.session.burrowId);

  const aliceNode = await askRoot(alice, "Alice owns this root");
  expect(aliceNode.burrowId).toBe(alice.session.burrowId);

  const aliceView = (await (await call(`/burrows/${alice.session.burrowId}`, { cookie: alice.cookie })).json()) as {
    nodes: { id: string }[];
  };
  expect(aliceView.nodes.map((node) => node.id)).toContain(aliceNode.id);

  expect((await call(`/burrows/${alice.session.burrowId}`, { cookie: bob.cookie })).status).toBe(404);
  expect(
    (await call(`/nodes/${aliceNode.id}`, {
      method: "PATCH",
      cookie: bob.cookie,
      body: { title: "stolen" },
    })).status,
  ).toBe(404);
  expect((await call(`/nodes/${aliceNode.id}`, { method: "DELETE", cookie: bob.cookie })).status).toBe(404);
  expect((await call(`/nodes/${aliceNode.id}/stream`, { cookie: bob.cookie })).status).toBe(404);
  expect((await call(`/nodes/${aliceNode.id}/cancel`, { method: "POST", cookie: bob.cookie })).status).toBe(
    404,
  );
  expect(
    (await call(`/nodes/${aliceNode.id}/restore`, { method: "POST", cookie: bob.cookie })).status,
  ).toBe(404);
  expect(
    (await call("/ask", {
      method: "POST",
      cookie: bob.cookie,
      body: { parentId: aliceNode.id, origin: { question: "hijack" } },
    })).status,
  ).toBe(404);
  expect(
    (await call("/ask", {
      method: "POST",
      cookie: bob.cookie,
      body: { nodeId: aliceNode.id, origin: aliceNode.origin },
    })).status,
  ).toBe(404);

  await call("/settings", {
    method: "PATCH",
    cookie: alice.cookie,
    body: { theme: "dark" },
  });
  const bobSettings = (await (await call("/settings", { cookie: bob.cookie })).json()) as {
    settings: Record<string, unknown>;
  };
  expect(bobSettings.settings).toEqual({});

  expect((await call(`/burrows/${bob.session.burrowId}`, { cookie: bob.cookie })).status).toBe(200);
  expect((await call(`/burrows/${bob.session.burrowId}`, { cookie: alice.cookie })).status).toBe(404);
});

test("refresh rotates, keeps cookie attributes, and rejects reuse", async () => {
  const user = await signUp();
  const oldRefresh = user.cookies.db_refresh;
  expect(oldRefresh).toBeTruthy();

  const refreshClaims = JSON.parse(
    Buffer.from(oldRefresh.split(".")[1], "base64url").toString("utf8"),
  ) as { sid: string };
  const expiredId = randomUUID();
  const expiredToken = signRefresh(
    user.session.user.id,
    refreshClaims.sid,
    expiredId,
    Math.floor(Date.now() / 1000) - 1,
  );
  const db = new DatabaseSync(TEST_DB_PATH);
  db.prepare(
    "INSERT INTO refresh_tokens (id, session_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)",
  ).run(expiredId, refreshClaims.sid, digest(expiredToken), Date.now() - 60_000, Date.now() - 1_000);
  db.close();
  expect(
    (await call("/auth/refresh", { method: "POST", cookie: `db_refresh=${expiredToken}` })).status,
  ).toBe(401);
  expect(
    (await call("/auth/refresh", { method: "POST", cookie: "db_refresh=not-a-token" })).status,
  ).toBe(401);

  const refresh = await call("/auth/refresh", {
    method: "POST",
    cookie: `db_refresh=${oldRefresh}`,
  });
  expect(refresh.status).toBe(200);
  const rotated = readCookies(refresh.headers);
  expect(rotated.cookies.db_refresh).toBeTruthy();
  expect(rotated.cookies.db_refresh).not.toBe(oldRefresh);
  expect(rotated.cookies.db_access).toBeTruthy();

  const refreshCookie = rotated.raw.find((value) => value.startsWith("db_refresh="))!;
  expect(refreshCookie).toContain("HttpOnly");
  expect(refreshCookie).toMatch(/SameSite=Lax/i);
  expect(refreshCookie).toContain("Path=/api/auth/refresh");
  expect(refreshCookie).toContain("Max-Age=");
  const accessCookie = rotated.raw.find((value) => value.startsWith("db_access="))!;
  expect(accessCookie).toContain("HttpOnly");
  expect(accessCookie).toMatch(/SameSite=Lax/i);
  expect(accessCookie).toContain("Path=/");

  const reuse = await call("/auth/refresh", {
    method: "POST",
    cookie: `db_refresh=${oldRefresh}`,
  });
  expect(reuse.status).toBe(401);

  const revoked = await call("/auth/refresh", {
    method: "POST",
    cookie: `db_refresh=${rotated.cookies.db_refresh}`,
  });
  expect(revoked.status).toBe(401);
});

test("password change revokes sessions and logout revokes the refresh token", async () => {
  const email = unique();
  const user = await signUp(email);
  const changed = await call("/auth/change-password", {
    method: "POST",
    cookie: user.cookie,
    body: { currentPassword: PASSWORD, newPassword: "new correct horse battery" },
  });
  expect(changed.status).toBe(204);
  expect(
    (await call("/auth/refresh", {
      method: "POST",
      cookie: `db_refresh=${user.cookies.db_refresh}`,
    })).status,
  ).toBe(401);
  expect(
    (await call("/auth/sign-in", { method: "POST", body: { email, password: PASSWORD } })).status,
  ).toBe(401);

  const next = await signIn(email, "new correct horse battery");
  const logout = await call("/auth/logout", {
    method: "POST",
    cookie: next.cookie,
  });
  expect(logout.status).toBe(204);
  expect(
    (await call("/auth/refresh", {
      method: "POST",
      cookie: `db_refresh=${next.cookies.db_refresh}`,
    })).status,
  ).toBe(401);
});

test("an expired access cookie refreshes transparently", async ({ page }) => {
  const email = unique();
  const response = await page.request.post("/api/auth/sign-up", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok()).toBe(true);
  const session = (await response.json()) as Session;

  await page.context().addCookies([
    {
      name: "db_access",
      value: signAccess(session.user.id, -1),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/");
  await expect(page.getByTestId("auth-screen")).toHaveCount(0);
  await expect(page.getByTestId("entry-composer")).toBeVisible();
  expect((await page.request.get("/api/auth/me")).ok()).toBe(true);
});

test("settings changes the password and requires a fresh sign-in", async ({ page }) => {
  const email = unique();
  const next = "new correct horse battery";
  const response = await page.request.post("/api/auth/sign-up", {
    data: { email, password: PASSWORD },
  });
  expect(response.ok()).toBe(true);

  await page.goto("/");
  await page.getByTestId("open-settings").click();
  await expect(page.getByTestId("account-email")).toHaveText(email);
  await page.getByTestId("current-password").fill(PASSWORD);
  await page.getByTestId("new-password").fill(next);
  await page.getByTestId("change-password").click();

  await expect(page.getByTestId("auth-screen")).toBeVisible();
  await expect(page.getByTestId("auth-notice")).toContainText(/sign in again/i);
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(next);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("entry-composer")).toBeVisible();
});
