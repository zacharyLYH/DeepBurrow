import { expect } from "@playwright/test";
import { demoCredentials } from "../packages/types/src/fixtures.ts";
import { latestCode } from "./mock-smtp.ts";

type App = { fetch: (request: Request) => Response | Promise<Response> };

export type CookieJar = { cookie: string; cookies: Record<string, string>; raw: string[] };

export function readCookies(headers: Headers): CookieJar {
  const raw =
    (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    [headers.get("set-cookie") ?? ""];
  const cookies: Record<string, string> = {};
  for (const value of raw.filter(Boolean)) {
    const pair = value.split(";")[0];
    const at = pair.indexOf("=");
    cookies[pair.slice(0, at)] = pair.slice(at + 1);
  }
  return {
    raw: raw.filter(Boolean),
    cookies,
    cookie: Object.entries(cookies)
      .map(([name, value]) => `${name}=${value}`)
      .join("; "),
  };
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

const cookieFor = async (send: (path: string, init: RequestInit) => Promise<Response>) => {
  const email = demoCredentials.email;
  expect((await send("/auth/email", json({ email }))).status).toBe(202);
  const code = await latestCode(email);
  const response = await send("/auth/verify", json({ email, code }));
  expect(response.ok).toBe(true);
  return readCookies(response.headers).cookie;
};

export const demoCookie = (app: App) =>
  cookieFor(async (path, init) => app.fetch(new Request(`http://api${path}`, init)));

export const remoteCookie = (url: string) =>
  cookieFor(async (path, init) => fetch(`${url}${path}`, init));
