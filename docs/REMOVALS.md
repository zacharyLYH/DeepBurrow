# Simplification log

Running list of changes we agreed to make and features/removals still on the table.
LOC are approximate and include coupling (CSS, tests, API/db) — not just the component.
Everything below is landed, or was considered and rejected with a reason. No open boxes.

## 0. Landed in the consolidation pass

- **Parent marks + manual tidy cut.** Child origin stores only `selectedText`; the child
  card shows that reference. Deleted the rehype mark pass, marks grouping, `onReveal`,
  selection offsets, hover/hot plumbing, `.db-mark`/`.db-hot-marks`, manual tidy
  (`tidyPositions`, `T`, toolbar/palette entry, `db-tidying`), and the stale `anchor`
  field. Positions and drag are unchanged.
- **One owner per derived thing.** Canvas owns card data; node position is the
  only position source; `ask` is derived server-side from `origin`; `onMove` is a Canvas
  prop, not card data.
- **Collapse + auto-tidy + seen ledger deleted.** `CollapseMode`, `collapsed`, `seen`,
  `patchMany`, `foldedUnder`, the subtree-size pass, the 2s interval, the stack badge,
  menu entries, the Canvas settings section, `GRACE_OPTIONS`/`autoTidy`/`tidyGrace`,
  `.db-stack` CSS, and the `data-collapsed` hook are gone. `use-canvas.ts` is gone too:
  per-card text size is `NodeCard`-local, and `descendantsOf` lives in `layout.ts`.
- **`flowNodes` duplicate line fixed** (build was red). The node and edge lists derive
  in one pass per render.
- **`apps/web/src/lib/use-mobile.ts` deleted** — zero imports.
- **Placement/title defaults moved server-side.** `node.pending` now carries the stored
  row, so the client no longer mirrors `NEW_CARD_GAP`, `titleFromOrigin` or the pending
  card shape. Retry reuses the row and its pending event.
- **Resize cut; cards size to content.** `useResize`, the `.db-resize` handle, `onResize`,
  `MIN_CARD_WIDTH`/`MIN_CARD_HEIGHT`, `w`/`h` in `CanvasState` and the fixed node
  `width`/`height` are gone. The card is `CARD_WIDTH` (320px, capped to the viewport),
  min 140px, max `min(620px, 100dvh - 120px)`; the body scrolls at the cap. React Flow's
  geometry for a card is the seed `CARD_WIDTH`/`CARD_HEIGHT`; the card paints its own
  height, and center uses the same seed size. Pinned by `canvas-edit.spec.ts`
  "cards size to content and have no resize handle".
- **Images clamp** to the card (`max-width: 100%`, `max-height: 320px`).
- **Wide tables scroll** in their own container (`display: block; overflow-x: auto`).
  Code, math and Mermaid already scrolled. Pinned in `markdown.spec.ts`.
- **Empty answer is a failure, not an empty card.** A run that streams no text settles
  `failed` with `Empty answer`, keeps the meta it did get, and offers retry. Test seam:
  `zzempty`. Pinned in `server.spec.ts`.
- **Lightbox opens on click, not pointerdown**, and ignores a pointer that moved more than
  8px, so a scroll or drag that starts on an image stays a scroll. Pinned in
  `markdown.spec.ts`.
- **One ask payload builder.** New asks and retries share `payload(origin, parentId, nodeId?)`
  in `use-burrow.ts`; only the stream wiring differs (a new ask adopts its id).
- **Small single-owner fixes.** Ask popover width comes from `POPOVER_WIDTH` (no `w-80`
  drift); the graph walks share `MAX_DEPTH` in `db.ts`; the card font step uses
  `clampReading` (no second 0.8–1.4 spec); the theme toggle is `toggleTheme` (toolbar and
  palette share it).
- **Copy trail/document replaced by HTML export.** The two Markdown slices had no clear
  destination; single-card copy stays. Export clones `.react-flow`, inlines same-origin CSS,
  sets 1:1 page-scroll bounds, and strips live chrome. Its only script is a small inline
  enhancement layer: theme, global text size, zoom/reset, and an image lightbox. With JS
  off, the document remains a static readable page.
- **Dead surface removed.** Unused CSS (`.db-menu-item`, `.db-math-display`, `.db-select`,
  `.db-shortcuts`), unused `export`s, and the server's per-round `console.log` are gone.
  Per-card text size now lives in `NodeCard`, so the flat scale map and the
  `view.visible` alias are gone (the canvas already has `nodes`).
- **Empty burrow framing.** The first card of a burrow that started empty is centered;
  a restored frame still never moves the camera on load. Pinned in `entry.spec.ts`.
- **Edges are anchored to the cards.** Each card renders two invisible 1×1 DOM handles on
  the header line (target left, source right). React Flow measures those bounds directly.
  The old root fade-in scaled the card, so measuring mid-transform left source anchors ~5px
  inside the card and produced transient `Couldn't create edge` warnings; the fade is gone.
  Pinned by `canvas.spec.ts` "edges leave the source card's right edge" and "edges follow
  cards that are not in a row".
- **Tests pinned:** `settings.spec.ts` asserts edits land on `users.settings` and a clean
  context reads them back; `positions.spec.ts` asserts the drag position and shared
  camera survive reload (twice, and in a fresh context); `mobile.spec.ts` long-presses
  text with real touch events and asserts the ask popover survives finger lift and
  submits. `visuals.spec.ts` covers desktop and iPhone 13 snapshots of settings, the
  palette, the card menu, dark mode, rich Markdown, and a selection-referenced answer.
  The mobile answered-card check draws a screenshot again: it re-centers via a
  palette jump after the answer settles, so the framing no longer depends on when the
  card first mounted, and it also asserts card/drawer geometry. README no longer
  advertises collapse or resize.

## 1. Agreed changes (all landed)

### Positions, camera, presets (server is the source of truth)
- [x] Node positions persist to the DB in React Flow **world coordinates** (`node.position`), written on drag stop. No localStorage, no client layout fallback, no fit/relaxed layout on load. — pinned by `tests/positions.spec.ts`.
- [x] One shared viewport (`{x, y, zoom}`) per burrow, restored verbatim. No per-device variants. — pinned by `tests/positions.spec.ts` and `tests/mobile.spec.ts`.
- [x] Presets live on the user row and are read/written through `GET`/`PATCH /api/settings`. — verified there is only one owner: the server stores no preset defaults at all, so the client constant is the only seed and there is no parallel truth to remove. Pinned by `tests/settings.spec.ts`.

### Card sizing (content-driven, no resize)
- [x] Remove resize entirely: handle, `.db-resize`, `useResize`, `onResize`, and `w`/`h` in session canvas state.
- [x] Width: one layout width (default card width, capped to mobile viewport); content never widens the card.
- [x] Height: auto to content, with a **generous max height**; body scrolls once it hits the cap.
- [x] Node size is not part of the graph: `CARD_WIDTH`/`CARD_HEIGHT` are the flow geometry that edges and center use; the card paints its own height below that.
- [x] Images/media: clamp to content width AND cap max-height (aspect preserved); full size via lightbox.
- [x] Header, sources, chips, status rows flow naturally; body keeps a usable minimum height.

### Wide content
- [x] Tables, `pre`/code, and display math each get their own horizontal scroll container. — tables now `display: block; overflow-x: auto`; code/math/Mermaid already scrolled; images clamp to the card instead of scrolling.

### Answer lifecycle
- [x] An answer with no text is a persisted error with retry, never an empty answered card. Meta still lands.

### Lightbox
- [x] Open on click/tap, never pointerdown; a scroll or drag that starts on an image does not open it (8px movement threshold).

### Mobile
- [x] Async heights are acceptable; nothing important is pinned below a tall card, and images/media are capped so a picture cannot outgrow the viewport. The phone answered-card check recenters after the answer settles, then asserts geometry and a stable screenshot.

## 2. Considered and rejected (keep as-is)

These were on the list. Each was checked against the code and dropped, because finishing
it would cost more than it saves or would remove something useful.

- **Per-card text size** (two scaling systems). It is not duplicated logic: global `readingSize`
  sets the base, the card menu overrides it per card. Removing the override is a feature loss.
- **Theme controls in three places** (sheet, toolbar cycle, palette).
  They call the same setter; they are affordances, not parallel logic.
- **Scattered constants** (`center` zoom, `FIT`, `DEBOUNCE`). Each is used in exactly one
  module; centralising buys an import and loses locality.
- **`DEFAULT_VIEWPORT`.** It is React state initialisation before the server row loads, not
  a second source of truth.
- **Presets seeded/reset on the server.** The premise was wrong: the server never stores
  preset defaults, so a reset endpoint would add an API, a server constant and a client
  fetch to remove one client constant.
- **Canvas local position mirror** (`pos`/`posRef`/drag branch). That local copy is what makes
  dragging smooth while the server owns the stored position; React Flow's own state would
  need the same bridge and the tests would not get simpler.
- **Micro refactors with test churn, no measured gain:** `progress` array shape, reattach
  effect, settings store import side effect, `DEMO_BURROW` lookup helper, `seed()` placement,
  `readSettings` re-parsing, `restoreBranch` timestamp key, `db-root` entrance animation.
- **Visual snapshots.** Keep them: they caught the hidden-node and layout regressions in this
  very pass, and functional assertions do not see pixels.
- **`skills/react-flow-canvas-testing/SKILL.md`.** Actively used and updated with the
  auto-height and one-runner sharp edges.
- **`overlays.tsx` `KEYS` list.** It is the shortcuts help UI, not duplicated logic.
- **Dependency pruning** (`mermaid`, `katex`/`remark-math`, `highlight.js`, radix dialog and
  dropdown, `sonner`, `store.ts`). Those are feature removals, not simplifications. Revisit
  only if the feature itself goes.

## 3. Sharp edges worth remembering

- A content-sized React Flow node needs a seed size (`measured`/`initialWidth`/`initialHeight`);
  without it the node stays `visibility: hidden` until the ResizeObserver runs.
- React Flow honours `handles` declared on node data only until it measures the node, then
  reads the DOM. Rendering real DOM handles avoids a re-adopt pass; declaring `measured`
  keeps fit/center from queueing behind a measurement that never comes.
- Only one Playwright runner at a time: `reuseExistingServer` will happily adopt a server
  that is about to shut down, and the suite then fails with `ERR_CONNECTION_REFUSED`.
