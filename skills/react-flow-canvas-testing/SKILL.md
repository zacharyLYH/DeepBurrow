---
name: react-flow-canvas-testing
description: Sharp edges when testing an @xyflow/react canvas with Playwright, plus how to force streaming failures without test hooks in the app.
---

# React Flow canvas testing

## New nodes are `visibility: hidden` until measured

`@xyflow/react` wraps each node in a div with `visibility: hasDimensions ? "visible" : "hidden"`.
Dimensions come from a `ResizeObserver` after mount. A node added at runtime, or a canvas
mounted while the page is busy, can stay hidden long enough that Playwright's
`toBeVisible()` / `click()` fail with `unexpected value "hidden"` or a 30s actionability timeout.

Symptom looks like a React bug: the card element exists, `data-status` attributes update, but the
accessibility snapshot shows no cards at all.

Fix: pass dimensions on the flow nodes so they are visible on first paint.

```ts
const flowNodes = nodes.map((item) => ({
  id: item.id,
  type: "card",
  position: positions[item.id],
  width: CARD_WIDTH,
  height: CARD_HEIGHT,
  data: { item },
}));
```

Also gate the canvas behind the data load (`if (loading) return <Notice/>`), so React Flow mounts
once with nodes instead of mounting empty and receiving them later.

## Fault injection, not a mocked app

The fake model fails the first `summarize` for an ask containing `FAKE_FAIL_ASK` (set to `zzfail`
in `playwright.config.ts`). The real server error path runs, persists the failed node, and Retry
recovers it.

```ts
test("failed card shows reason and retry recovers same node", async ({ page }) => {
  await open(page);
  const card = await ask(page, "Does zzfail break?");
  await expect(card).toHaveAttribute("data-status", "failed");
});
```

Keep `page.route` only for states the server cannot produce on demand — e.g. fulfilling
`GET /api/burrows/demo` with a 500 to exercise the load-error screen, then letting Retry through to
the real API.

## Reset the demo burrow instead of mocking the load

Every test writes to the same SQLite file, so node counts and screenshots drift across runs.
`tests/db.ts` deletes the demo burrow's nodes and re-inserts the fixture rows directly through
`node:sqlite`; call it from `beforeEach`. `playwright.config.ts` pins `workers: 1` because the API
and the test process share that file.
