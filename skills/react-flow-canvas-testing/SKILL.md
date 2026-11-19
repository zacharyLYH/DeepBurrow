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

Fix: if the card has a fixed size, pass `width`/`height`. If the card sizes to its content,
pass `initialWidth`/`initialHeight` instead: they seed the first paint only, then
`ResizeObserver` measurement takes over. Never pass a fixed `height` to a content-sized card.

```ts
const flowNodes = nodes.map((item) => ({
  id: item.id,
  type: "card",
  position: positions[item.id],
  initialWidth: CARD_WIDTH,
  initialHeight: CARD_HEIGHT,
  data: { item },
}));
```

Also gate the canvas behind the data load (`if (loading) return <Notice/>`), so React Flow mounts
once with nodes instead of mounting empty and receiving them later.

## One runner at a time

`playwright.config.ts` has `reuseExistingServer: !process.env.CI`. If a previous run is still
alive, the next run reuses its dev server and inherits its shutdown: tests fail mid-run with
`net::ERR_CONNECTION_REFUSED` on `:5173`, `0` react-flow nodes, and random 30s timeouts.
Kill `playwright`/`vite`/the API first, confirm `lsof -ti:5173,8787` is empty, then start.
Run long suites in the background and poll the log; a foreground timeout can leave a runner
behind to poison the next attempt.

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

## Measure real handles; never scale the card while they are measured

Invisible 1×1 `<Handle>` components on the card header are the reliable anchor: React Flow
measures their DOM bounds once and edges route from the card border. Declared `handles` on
node data look simpler, but measurement overwrites them with empty DOM bounds; the re-adopt
workaround logs transient `Couldn't create edge ... handle id: "null"` warnings and can keep
stale anchors. Keep `measured: {width, height}` as the seed size so the camera has geometry
before the first measurement.

Do not animate `transform` on the card root. A fade-in scale is enough to make React Flow
measure handles at ~0.97 scale, leaving every source anchor a few pixels inside the card
after the animation finishes. Fade opacity only, or animate an inner element.

A 1.5px edge is well under a 2% screenshot tolerance, so a golden can pass while every line
is gone (a missing line layer changed only ~90-120 pixels in a 1280x800 shot). Pin the
anchor with a DOM assertion instead:

```ts
const start = path.getPointAtLength(0);
const point = new DOMPoint(start.x, start.y).matrixTransform(path.getScreenCTM()!);
expect(Math.abs(point.x - cardRect.right)).toBeLessThan(8);
```

…and keep screenshot tolerances in pixels (`maxDiffPixels: 40`), not ratios.
