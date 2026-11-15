import { readFileSync } from "node:fs";
import { type AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { createMockServer } from "../apps/api/src/mock-sse.ts";
import { parseHeader, parseEvent } from "../packages/types/src/header.ts";
import { fixtureEvents, fixtureHole, fixtureNodes } from "../packages/types/src/fixtures.ts";
import type { Event } from "../packages/types/src/types.ts";

const schema = readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8");

test("schema applies and stores a fixture node", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schema);

  const node = fixtureNodes[0];
  db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
    fixtureHole.userId,
    "fixture@example.com",
    fixtureHole.createdAt,
  );
  db.prepare("INSERT INTO holes (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    fixtureHole.id,
    fixtureHole.userId,
    fixtureHole.title,
    fixtureHole.createdAt,
    fixtureHole.updatedAt,
  );
  db.prepare(
    "INSERT INTO nodes (id, hole_id, parent_id, title, markdown, origin, sources, followups, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    node.id,
    node.holeId,
    node.parentId,
    node.title,
    node.markdown,
    JSON.stringify(node.origin),
    JSON.stringify(node.sources),
    JSON.stringify(node.followups),
    node.status,
    node.createdAt,
    node.updatedAt,
  );

  const row = db.prepare("SELECT title, status FROM nodes WHERE id = ?").get(node.id) as {
    title: string;
    status: string;
  };
  expect(row).toEqual({ title: node.title, status: "answered" });
  expect(db.prepare("SELECT count(*) AS n FROM nodes").get()).toEqual({ n: 1 });
  db.close();
});

test("mock server serves the fixture hole and a well-formed stream", async () => {
  const server = createMockServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://localhost:${port}`;

  try {
    expect(await (await fetch(`${base}/hole`)).json()).toEqual(fixtureHole);

    const stream = await (await fetch(`${base}/ask`)).text();
    const events = stream
      .split("\n\n")
      .filter(Boolean)
      .map((chunk) => parseEvent(JSON.parse(chunk.replace(/^data: /, ""))) as Event);

    expect(events.map((event) => event.type)).toEqual([
      "node.pending",
      "node.meta",
      "node.token",
      "node.token",
      "node.done",
    ]);
    expect(events).toEqual(fixtureEvents);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("header parses before body and never leaks", () => {
  const body = "Slow start doubles every RTT.\nTITLE: not a header mid-body";
  const text = [
    "TITLE: TCP congestion control",
    "SOURCES: RFC 5681 — https://www.rfc-editor.org/rfc/rfc5681 | Nagle — https://example.com/nagle",
    "FOLLOWUPS: Why double per RTT? | When does CUBIC beat Reno?",
    body,
  ].join("\n");

  const { meta, body: parsedBody } = parseHeader(text);
  expect(meta.title).toBe("TCP congestion control");
  expect(meta.sources).toEqual([
    { title: "RFC 5681", url: "https://www.rfc-editor.org/rfc/rfc5681" },
    { title: "Nagle", url: "https://example.com/nagle" },
  ]);
  expect(meta.followups).toEqual(["Why double per RTT?", "When does CUBIC beat Reno?"]);
  expect(parsedBody).toBe(body);
});

test("bad events are rejected", () => {
  expect(() => parseEvent({ type: "node.nope", nodeId: "n" })).toThrow();
  expect(() => parseEvent({ type: "node.token", nodeId: "n" })).toThrow();
  expect(() => parseEvent(null)).toThrow();
});
