# Build plan

Work split so every piece is testable on its own. The seam that makes it possible: **event contract + mock SSE server**. FE never needs BE, BE never needs a real model or real search.

Reference: copy FE + UIUX from `~/Desktop/rabbithole` (vanilla JS + esbuild). Keep its look and flows; reimplement in React per README UI spec.

## Whole, then halves, then quarters

**1 piece.** Ask a question → answer card appears on canvas. One Playwright test proves it.

**2 pieces.**
- **A. FE against a mock SSE server.** Canvas, asking, streaming states.
- **B. BE against a fake model adapter and fixture search server.** Graph, DB, events.

Contract = shared types + DB schema + event list. Both build to it, neither blocks.

**4 pieces.** Split B, keep A whole:
1. Contract + scaffold — types package, SQLite migrations, event spec, mock SSE server, Playwright harness.
2. FE — as above.
3. BE graph — `plan → compose → summarize`, no search, no loop.
4. Search — curl executor, raw injection, source validation.

## Milestones

| # | Scope | Exit test |
|---|---|---|
| M0 | Contract + scaffold: types, schema, event spec, mock SSE, test harness | Contract suite green; FE renders a fixture burrow |
| M1 | FE canvas: xyflow plane, tree layout, cards, edges | Playwright: pan, zoom, long body scrolls, layout no overlap |
| M2 | FE asking + light dark mode toggle + streaming: popover, pills, pending→streaming→answered, header strip, retry | Playwright vs mock SSE: 4 states; title, sources, chips appear |
| M3 | BE core + FE cutover: repo, `plan/compose/summarize`, fake model, SSE. FE hooks real burrow/node/ask endpoints, retry, errors. No search | Unit: nodes pure + replay. Playwright vs real BE: ask → stream → answered, reload persists, retry works; app no longer uses mock SSE |
| M4 | Loop: `judge`, suggested questions, caps. FE renders suggested question progress + stop states | Scripted fake model forces 3 rounds and each stop condition; assert call counts. FE suggested question lines advance, no stuck cards |
| M5 | Parity pass vs `~/Desktop/rabbithole`: side-by-side flows, UI, endpoints; fix deltas | Parity checklist green; remaining deltas logged |
| M6 | Search: curl executor, 20k cap, untrusted label, verbatim-URL filter | Fixture search server: one call per round, junk URLs dropped, failure → empty and still answers |
| M7 | Auth + BYOK: email login, encrypted creds, provider verify. FE login + setup screens | Signup → key encrypted at rest → verify passes/fails vs fake provider |
| M8 | PWA + notifications | SW registers, manifest valid, hidden-tab completion fires notification |

## Ordering

- M0 blocks everything.
- M1/M2 and M3/M4 backend halves run in parallel after M0. FE cutover inside M3/M4 lands once M2 is done.
- M5 needs M2, M3, M4 — parity after the whole spine works.
- M6 needs M4.
- M7 independent, can start at M0.
- M8 last, but stubbable earlier.

## Deliberately deferred

Presets settings, ⌘K, notes, follow-up chips, error polish. M5 parity pass sweeps these up and fixes flow/UI deltas. Costs nothing to defer — M2 already proves the streaming contract they hang off.

## Sizing rule

One exit test that fails before and passes after. No milestone bigger than ~1 day. If a milestone needs two mocks to test, it's two milestones.
