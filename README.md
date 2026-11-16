# DeepBurrow
Cloud synced, BYOK, infinite canvas rabbitholing.

# What
Deep dives branch; chat bubbles can't. [rabbithole.ing](https://rabbithole.ing/about/) has the right shape but isn't web app first. We keep the UIUX and drift here:

- Cloud sync
- Editable system prompts
- PWA, installable
- Web app only; no MCP, no snapshots
- Agents in backend; keys never in browser
- BYO search
- Question or file input; no markdown, no links
- No `.rabbithole` export

# UX
1. Login with email
2. Setup: provider link, model, API key. Backend tests it as OpenAI-compatible. Only option.
3. Ask a question or attach a file
4. Backend agent researches, may loop
5. Final answer streams back with sources; tool calls stay server side
6. Branch: presets (Explain / ELI5 / Go deeper) are one prompt with different instruction text, editable. Context = lineage root→node, no siblings.

# UI spec
Reference is vanilla JS + esbuild. We reimplement in React.

Don't build: `@xyflow/react` (plane, edges, zoom), shadcn/ui (Popover, Command, Sheet, Sonner), `react-markdown` + remark/rehype + katex + mermaid. No tldraw/Excalidraw. Tree auto-tidy is ours, ~100 lines.

- **One canvas.** Cards on a plane, parent→child edges. No separate reader view; long answers scroll inside the card.
- **Entry.** Empty burrow = one composer → root card.
- **Asking.** Select text → popover: input + 3 preset pills, keys 1–3 → selection highlighted, pending card beside source, edge drawn.
- **Streaming.** Answer renders in-card. States: pending, streaming, answered, failed+retry.
- **Follow-up.** Each answered card has a hover handle under it; clicking slides out a drawer with the same preset row. The body stays fully readable.
- **⌘K.** Searches titles and ask text.
- **Notes.** Margin note per card, human or agent, chip, fed to later prompts.
- **Follow-up chips.** Content-specific questions from the answer; click fills the drawer, doesn't submit.
- **Presets.** Settings: label + instruction, two sets, linkable.
- **Sources.** Row under search-backed cards, parsed from the header.
- **Errors.** Failed keeps card + reason + retry. Aborted keeps partial text.
# Backend
LangGraph. State machine, testable as data.

```ts
type State = { burrowId; nodeId; lineage; ask: string; suggestedQuestions: string[]; round: number; queries: string[]; searchRaw: string; notes: string; answer; title; sources; followups; error };
```

```
plan → (suggested questions? search → compose → judge → suggested questions?) → summarize → END
```

- `plan` → `suggestedQuestions`. Trigger-happy: weak reason to research is enough. URL in ask = one suggested question, verbatim. No search config → no suggested questions.
- `search` → one call per round, queries from top suggested question, `searchRaw` = stringified response. Failure → `""`.
- `compose` → notes from lineage + ask + `searchRaw`, appended to `notes`. No header.
- `judge` → resolves/adds suggested questions, sets `done`. Small JSON.
- `summarize` → lineage + ask + `notes` + suggested questions → header, returns `{title, answer, sources, followups}`.

Nodes are `(state) => state`, no I/O. Model, search, DB, stream are adapters at the edge. Replay a state, same result. System prompt rebuilt every call — we persist completions only.

`ask` is the final text from FE; presets applied client-side, backend never knows which fired. Node ids are server-minted on create; the FE adopts the id from the first stream event, and retries reuse it.

# Loop rules
Only `summarize` writes user-visible text; everything before is notes. Stop when any fires:

1. `judge` says done
2. 3 rounds

"No new URL this round" arrives with search in M6. There is no token cap: a hard budget would cut an answer mid-thought, and the stop conditions already bound the work.

Log per round `{suggestedQuestion, queries, newUrls, tokens, verdict}`. `tokens` is an output estimate (chars / 4), kept for tuning, never enforced. 3 rounds ≈ 6 calls, so show suggested questions as progress lines in the pending card — questions only, no round numbers in the UI.

# Search
Off until configured.

Request: pasted curl — method, URL, headers, body, `{{query}}`. Response: not typed, stringified into `compose`, capped ~20k, labeled untrusted. Only URLs present verbatim in the blob may be cited.

# Header
Header, not tail. A tail can't be parsed while streaming.

```
TITLE: TCP congestion control
SOURCES: Nagle — https://x | RFC 5681 — https://y
FOLLOWUPS: Why does slow start double per RTT? | When does CUBIC beat Reno?
```

Parsed before the first body token, stripped, body streams untouched. Sources = what the model used, subset, each checked against the blob. Followups = leftover suggested questions or loose ends, 2–3.

# Data
SQLite via `node:sqlite` (`DatabaseSync`), raw SQL, no ORM. Lineage = recursive CTE up `parent_id`.

```sql
users(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL,
  base_url TEXT, model TEXT, api_key_enc BLOB, verified_at INTEGER,
  search TEXT NOT NULL DEFAULT '{}');  -- json: curl + key_enc + timeout

burrows(id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

nodes(id TEXT PRIMARY KEY, burrow_id TEXT NOT NULL REFERENCES burrows(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES nodes(id) ON DELETE CASCADE,
  title TEXT NOT NULL, markdown TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL,                -- json: selected_text, question, preset{label,instruction}, anchor
  sources TEXT NOT NULL DEFAULT '[]', followups TEXT NOT NULL DEFAULT '[]',
  progress TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

CREATE INDEX nodes_by_burrow ON nodes(burrow_id, parent_id);
```

`origin` is UI provenance only; prompts come from `markdown` + lineage.

# Stack
Fullstack TS + React.

- FE: React 19 + React Compiler, Vite, Tailwind, shadcn/ui, `@xyflow/react`, TanStack Query. Mobile-first.
- BE: Hono on Node, LangGraph.js, `node:sqlite`, SSE.
- Shared `types` package for state, node, event shapes.
- PWA day one: `vite-plugin-pwa`. Generation finishes while tab hidden → service worker Notification, tap focuses that node.

# Deploy
Docker Compose. nginx serves the web build on `:9994`, proxies `/api/` → `api:8787`. SQLite lives in named volume `db` at `/data/deepburrow.db`.
