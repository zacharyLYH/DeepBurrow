import { expect, test } from "@playwright/test";
import { safeEndpoint } from "../apps/api/src/llm.ts";
import { seal, unseal } from "../apps/api/src/secrets.ts";

test("private endpoints are refused unless explicitly allowed", async () => {
  const before = process.env.ALLOW_PRIVATE_PROVIDERS;
  delete process.env.ALLOW_PRIVATE_PROVIDERS;
  try {
    await expect(safeEndpoint("http://127.0.0.1:8787/v1")).rejects.toThrow(/https|private/);
    await expect(safeEndpoint("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(safeEndpoint("https://192.168.1.5/v1")).rejects.toThrow("private");

    process.env.ALLOW_PRIVATE_PROVIDERS = "1";
    expect((await safeEndpoint("http://127.0.0.1:8787/v1")).hostname).toBe("127.0.0.1");
  } finally {
    if (before === undefined) delete process.env.ALLOW_PRIVATE_PROVIDERS;
    else process.env.ALLOW_PRIVATE_PROVIDERS = before;
  }
});

test("keys seal to a different string and unseal exactly", () => {
  const sealed = seal("sk-secret");
  expect(sealed).not.toContain("sk-secret");
  expect(unseal(sealed)).toBe("sk-secret");
  expect(seal("sk-secret")).not.toBe(sealed);
});
