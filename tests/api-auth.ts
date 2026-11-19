import { expect } from "@playwright/test";
import { demoCredentials } from "../packages/types/src/fixtures.ts";

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

const signInRequest = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(demoCredentials),
};

const demoSession = async (response: Response | Promise<Response>) => {
  const value = await response;
  expect(value.ok).toBe(true);
  return readCookies(value.headers).cookie;
};

export const demoCookie = (app: App) =>
  demoSession(app.fetch(new Request("http://api/auth/sign-in", signInRequest)));

export const remoteCookie = (url: string) => demoSession(fetch(`${url}/auth/sign-in`, signInRequest));
