import { expect, test } from "@playwright/test";
import { fixtureBurrow, fixtureBurrows } from "../packages/types/src/fixtures.ts";
import type { Burrow } from "../packages/types/src/types.ts";
import { testApp, type TestApp } from "./app-harness.ts";

let api: TestApp;

test.beforeAll(async () => {
  api = await testApp("deepburrow-burrows-");
});

const call = (path: string, method = "GET", body?: unknown) =>
  api.call(path, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });

const list = async () =>
  ((await (await call("/burrows")).json()) as { burrows: Burrow[] }).burrows;

test("lists, creates, renames and enforces case-insensitive unique titles", async () => {
  expect((await list()).map((burrow) => burrow.id)).toEqual(
    fixtureBurrows.map((burrow) => burrow.id),
  );

  const created = await call("/burrows", "POST", { title: "  Signals  " });
  expect(created.status).toBe(201);
  const burrow = ((await created.json()) as { burrow: Burrow }).burrow;
  expect(burrow.title).toBe("Signals");
  expect(burrow.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  expect((await list()).map((item) => item.title)).toContain("Signals");

  expect((await call("/burrows", "POST", { title: "signals" })).status).toBe(409);
  expect((await call("/burrows", "POST", { title: "   " })).status).toBe(400);
  expect((await call("/burrows", "POST", { title: "x".repeat(81) })).status).toBe(400);

  const renamed = await call(`/burrows/${burrow.id}`, "PATCH", { title: "Signal processing" });
  expect(renamed.status).toBe(200);
  expect(((await renamed.json()) as { burrow: Burrow }).burrow.title).toBe("Signal processing");
  expect((await call(`/burrows/${burrow.id}`, "PATCH", { title: "TCP CONGESTION control" })).status).toBe(
    409,
  );

  // A rename keeps the stored camera; viewport-only patches still work.
  const camera = { x: 12, y: 34, zoom: 0.75 };
  expect((await call(`/burrows/${fixtureBurrow.id}`, "PATCH", { viewport: camera })).status).toBe(200);
  const renamedFixture = await call(`/burrows/${fixtureBurrow.id}`, "PATCH", {
    title: "TCP deep dive",
  });
  expect(renamedFixture.status).toBe(200);
  expect(((await renamedFixture.json()) as { burrow: Burrow }).burrow.viewport).toEqual(camera);

  const view = ((await (await call(`/burrows/${fixtureBurrow.id}`)).json()) as {
    burrow: Burrow;
  }).burrow;
  expect(view.title).toBe("TCP deep dive");
  expect(view.viewport).toEqual(camera);

  expect(
    (await call(`/burrows/${fixtureBurrow.id}`, "PATCH", { viewport: { x: 1, y: 2 } })).status,
  ).toBe(400);
  expect((await call(`/burrows/${fixtureBurrow.id}`, "PATCH", {})).status).toBe(400);
  expect((await call("/burrows/missing", "PATCH", { title: "Nowhere" })).status).toBe(404);
});
