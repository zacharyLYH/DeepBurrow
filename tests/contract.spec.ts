import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { parseHeader, parseEvent } from "../packages/types/src/header.ts";
import { fixtureBurrow, fixtureNodes } from "../packages/types/src/fixtures.ts";

const schema = readFileSync(new URL("../db/migrations/001_init.sql", import.meta.url), "utf8");

test("schema applies and stores a fixture node", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(schema);

  const node = fixtureNodes[0];
  db.prepare("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)").run(
    fixtureBurrow.userId,
    "fixture@example.com",
    fixtureBurrow.createdAt,
  );
  db.prepare("INSERT INTO burrows (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    fixtureBurrow.id,
    fixtureBurrow.userId,
    fixtureBurrow.title,
    fixtureBurrow.createdAt,
    fixtureBurrow.updatedAt,
  );
  db.prepare(
    "INSERT INTO nodes (id, burrow_id, parent_id, title, markdown, origin, sources, followups, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    node.id,
    node.burrowId,
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

  // Progress is live-only; the table has no column to persist it.
  const columns = (db.prepare("PRAGMA table_info(nodes)").all() as { name: string }[]).map(
    (column) => column.name,
  );
  expect(columns).not.toContain("progress");
  db.close();
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
  expect(() => parseEvent({ type: "node.progress", nodeId: "n" })).toThrow();
  expect(() => parseEvent({ type: "node.done", nodeId: "n" })).toThrow();
  expect(() => parseEvent({ type: "node.error", nodeId: "n" })).toThrow();
  expect(parseEvent({ type: "node.progress", nodeId: "n", line: "Planning" })).toEqual({
    type: "node.progress",
    nodeId: "n",
    line: "Planning",
  });
  const node = fixtureNodes[0];
  expect(parseEvent({ type: "node.done", nodeId: node.id, node })).toEqual({
    type: "node.done",
    nodeId: node.id,
    node,
  });
  expect(() => parseEvent(null)).toThrow();
});
