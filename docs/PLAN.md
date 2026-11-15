# Build plan

Work split so every piece is testable on its own. The seam that makes it possible: **event contract + mock SSE server**. FE never needs BE, BE never needs a real model or real search.

Reference: copy FE + UIUX from `~/Desktop/rabbithole` (vanilla JS + esbuild). Keep its look and flows; reimplement in React per README UI spec.

## Whole, then halves, then quarters

**1 piece.** Ask a question → answer card appears on canvas. One Playwright test proves it.

**2 pieces.**
- **A. FE against a mock SSE server.** Canvas, reader, asking, streaming states.
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
| M0 | Contract + scaffold: types, schema, event spec, mock SSE, test harness | Contract suite green; FE renders a fixture hole |
| M1 | FE canvas + reader: xyflow plane, tree layout, cards, edges, view switch | Playwright: pan, zoom, open reader, back, position preserved |
| M2 | FE asking + streaming: popover, pills, pending→streaming→answered, header strip, retry | Playwright vs mock SSE: 4 states; title, sources, chips appear |
| M3 | BE core, no search: repo, `plan/compose/summarize`, fake model, SSE out | Unit: nodes pure + replay. API: one node row, correct event sequence |
| M4 | Loop: `judge`, gap tracking, caps | Scripted fake model forces 3 rounds and each stop condition; assert call counts |
| M5 | Search: curl executor, 20k cap, untrusted label, verbatim-URL filter | Fixture search server: one call per round, junk URLs dropped, failure → empty and still answers |
| M6 | Auth + BYOK: email login, encrypted creds, provider verify | Signup → key encrypted at rest → verify passes/fails vs fake provider |
| M7 | PWA + notifications | SW registers, manifest valid, hidden-tab completion fires notification |

## Ordering

- M0 blocks everything.
- M1/M2 and M3/M4 run in parallel after M0.
- M5 needs M3.
- M6 independent, can start at M0.
- M7 last, but stubbable earlier.

## Deliberately deferred

Presets settings, ⌘K, notes, follow-up chips, error polish. A final parity milestone once the spine works. Costs nothing to defer — M2 already proves the streaming contract they hang off.

## Sizing rule

One exit test that fails before and passes after. No milestone bigger than ~1 day. If a milestone needs two mocks to test, it's two milestones.
