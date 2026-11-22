import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { digest, signAccess, signRefresh } from "../apps/api/src/security.ts";
import { demoCredentials } from "../packages/types/src/fixtures.ts";
import { readCookies, type CookieJar } from "./api-auth.ts";
import { resetDemoBurrow, TEST_DB_PATH } from "./db.ts";
import { latestCode, mailCount } from "./mock-smtp.ts";
import { startApi } from "./spawn-api.ts";

const API = "http://localhost:8787";

test.beforeEach(() => resetDemoBurrow());

const unique = () => `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;

type Session = { user: { id: string; email: string }; burrowId: string };
type Auth = { session: Session } & CookieJar;

type RequestOptions = {
  method?: string;
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
};

const request = (base: string, path: string, options: RequestOptions = {}) =>
  fetch(`${base}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

const call = (path: string, options: RequestOptions = {}) => request(API, path, options);
const post = (base: string, path: string, body: unknown) =>
  request(base, path, { method: "POST", body });

// Request and confirm a code, exactly like the UI.
const login = async (email = demoCredentials.email, base = API): Promise<Auth> => {
  expect((await post(base, "/auth/email", { email })).status).toBe(202);
  const code = await latestCode(email);
  const response = await post(base, "/auth/verify", { email, code });
  expect(response.status).toBe(200);
  return { session: (await response.json()) as Session, ...readCookies(response.headers) };
};

const withFreshApi = async (env: Record<string, string>, run: (base: string) => Promise<void>) => {
  const dataDir = mkdtempSync(join(tmpdir(), "deepburrow-codes-"));
  const api = await startApi({ dataDir, port: 8796, env });
  try {
    await run(api.url);
  } finally {
    await api.stop();
  }
};

test("signed-out users enter email, receive a code, and sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("auth-screen")).toBeVisible();

  await page.getByTestId("auth-email").fill(demoCredentials.email);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("auth-code")).toBeVisible();

  const code = await latestCode(demoCredentials.email);
  const otp = page.locator('input[data-testid="auth-code"], [data-testid="auth-code"] input');
  await otp.focus();
  await page.keyboard.type(code);
  await page.getByTestId("auth-submit").click();

  await expect(page.getByTestId("auth-screen")).toHaveCount(0);
  await expect(page.locator(".react-flow__node")).toHaveCount(4);
  await expect(page.getByTestId("burrow-title")).toHaveText("TCP congestion control");
});

test("a new email creates the account only after the code is confirmed", async () => {
  const email = unique();
  expect((await call("/auth/email", { method: "POST", body: { email } })).status).toBe(202);

  const db = new DatabaseSync(TEST_DB_PATH);
  const before = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  db.close();
  expect(before).toBeUndefined();

  const code = await latestCode(email);
  const response = await call("/auth/verify", { method: "POST", body: { email, code } });
  expect(response.status).toBe(200);
  const auth = { session: (await response.json()) as Session, ...readCookies(response.headers) };
  expect(auth.session.user.email).toBe(email);
  expect(auth.session.burrowId).toBeTruthy();
  expect((await call("/auth/me", { cookie: auth.cookie })).ok).toBe(true);

  const saved = new DatabaseSync(TEST_DB_PATH);
  const after = saved.prepare("SELECT id FROM users WHERE email = ?").get(email) as
    | { id: string }
    | undefined;
  saved.close();
  expect(after?.id).toBe(auth.session.user.id);
});

test("responses never reveal whether an account exists", async () => {
  const known = await call("/auth/email", { method: "POST", body: { email: demoCredentials.email } });
  const unknown = await call("/auth/email", { method: "POST", body: { email: unique() } });
  expect(known.status).toBe(202);
  expect(unknown.status).toBe(202);
  expect(await known.json()).toEqual(await unknown.json());

  const badKnown = await call("/auth/verify", {
    method: "POST",
    body: { email: demoCredentials.email, code: "abc" },
  });
  const badUnknown = await call("/auth/verify", {
    method: "POST",
    body: { email: unique(), code: "abc" },
  });
  expect(badKnown.status).toBe(401);
  expect(badUnknown.status).toBe(401);
  expect(await badKnown.json()).toEqual(await badUnknown.json());
});

test("failed code attempts are rate limited per IP", async () => {
  const headers = { "x-forwarded-for": "203.0.113.99" };
  await call("/auth/email", { method: "POST", body: { email: demoCredentials.email } });
  const attempt = () =>
    call("/auth/verify", {
      method: "POST",
      headers,
      body: { email: demoCredentials.email, code: "123456" },
    });

  for (let index = 0; index < 10; index++) expect((await attempt()).status).toBe(401);
  expect((await attempt()).status).toBe(429);
});

test("an expired code is refused", async () => {
  await withFreshApi({ CODE_TTL_MS: "100" }, async (base) => {
    const email = unique();
    expect((await post(base, "/auth/email", { email })).status).toBe(202);
    const code = await latestCode(email);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const response = await post(base, "/auth/verify", { email, code });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toBe("Invalid or expired code");
  });
});

test("resend respects cooldown, replaces the code, and caps attempts", async () => {
  await withFreshApi({ CODE_TTL_MS: "60000", CODE_RESEND_MS: "400" }, async (base) => {
    const email = unique();
    expect((await post(base, "/auth/email", { email })).status).toBe(202);
    const first = await latestCode(email);
    const count = await mailCount(email);

    // An immediate resend answers generically but sends nothing.
    expect((await post(base, "/auth/email", { email })).status).toBe(202);
    expect(await mailCount(email)).toBe(count);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await post(base, "/auth/email", { email })).status).toBe(202);
    expect(await mailCount(email)).toBe(count + 1);
    const second = await latestCode(email);
    if (second !== first) {
      expect((await post(base, "/auth/verify", { email, code: first })).status).toBe(401);
    }
    expect((await post(base, "/auth/verify", { email, code: second })).status).toBe(200);

    // A fresh code dies after five wrong attempts.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect((await post(base, "/auth/email", { email })).status).toBe(202);
    const third = await latestCode(email);
    for (let index = 0; index < 5; index++) {
      expect((await post(base, "/auth/verify", { email, code: "123456" })).status).toBe(401);
    }
    expect((await post(base, "/auth/verify", { email, code: third })).status).toBe(401);
  });
});

test("refresh rotates, keeps cookie attributes, and rejects reuse", async () => {
  const user = await login(unique());
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

test("an expired access cookie refreshes transparently", async ({ page }) => {
  const email = unique();
  expect((await page.request.post("/api/auth/email", { data: { email } })).status()).toBe(202);
  const code = await latestCode(email);
  const response = await page.request.post("/api/auth/verify", { data: { email, code } });
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
  await expect(page.getByTestId("empty-canvas")).toBeVisible();
  expect((await page.request.get("/api/auth/me")).ok()).toBe(true);
});

test("logout revokes the refresh token", async () => {
  const user = await login(unique());
  const logout = await call("/auth/logout", { method: "POST", cookie: user.cookie });
  expect(logout.status).toBe(204);
  expect(
    (await call("/auth/refresh", {
      method: "POST",
      cookie: `db_refresh=${user.cookies.db_refresh}`,
    })).status,
  ).toBe(401);
});
