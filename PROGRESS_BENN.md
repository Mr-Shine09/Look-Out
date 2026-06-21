# PROGRESS — Benn (Frontend / UX track)

Branch: `feat/luma-scrape-source`
Owner: Benn (frontend/UX). Friend "Oak" owns backend (has a Netlify deploy).

> **Cascade: read this top block every session before doing anything.**

---

## BENN'S STANDING INSTRUCTIONS (re-read every chat)
1. Keep this file (`PROGRESS_BENN.md`) updated — log conversation + what we did.
2. Keep Benn's instructions + the two memories at the TOP of this file; refer to them every time.
3. **Commit + push after finishing each function/component** (small commits, this branch).
4. Understand and restate the project goal: explain what was done and how it maps to the
   bigger suppression-engine goal; keep self-prompting until the task is finished.
5. **Before each test session: `git fetch` + `git log`** to pick up Oak's backend changes.
   For real-backend tests, point the frontend at Oak's deployed URL via
   `VITE_API_BASE=<url>` + `VITE_USE_REAL_BACKEND=true` (confirm the URL with Oak).
6. Frontend files Benn owns: `searchPage.js`, `stayPage.js`, `reportPage.js`, `pages.css`,
   `router.js`, `header.js`. Shared seam (coordinate before editing): `main.js`,
   `src/api/{mock,real}.js` — keep mock & real in parity.

---

## MEMORY 1 — Lookout pitch & positioning (suppression engine)
- Lookout = a SUPPRESSION ENGINE, not a watcher. Category claim: "Every alert tool is built to
  notify you MORE. Lookout is the first built to notify you LESS." Gets quieter & sharper the
  longer it runs.
- For every detected change it asks two questions: (1) have I effectively shown this to you
  before? (semantic duplicate, Redis vector KNN) and (2) does it actually matter? (Anthropic
  judge). It only alerts when BOTH clear the bar.
- Redis (RediSearch) IS the engine; Anthropic = embeddings + relevance judging; Browserbase =
  fetch/web-watching; WebSocket = live push; Sentry = observability.
- The tunable semantic-similarity threshold for dedup IS the product (too loose = Google Alerts;
  too tight = miss real updates).
- Preferred elevator pitch: "Every alert tool is built to notify you more. Lookout is the first
  built to notify you less."

## MEMORY 2 — UX direction: Search + Stay + Report
- Core idea = SEARCH + STAY + REPORT. ONE PAGE = ONE PURPOSE (clean, minimal, search-first).
- SEARCH (front door): prominent search bar + filters that narrow scope and constrain the
  backend; examples/test cases below.
- STAY: watches continuously and SUPPRESSES noise; show surviving alerts + how much was
  suppressed; gets quieter over time.
- REPORT: route results to the user via channels (dashboard, email, etc.).
- "Research grants" is one optional example, NOT a co-equal default lane; default surfaced thing
  is "new events near me." Build flow first with neutral styling.

---

## SESSION-SPECIFIC DECISIONS (Jun 21, 2026)
- ClawBot = **generic AI-agent connectors** (connect any agent/webhook that receives surfaced alerts).
- Delivery-tab **progress tracking dropped** (Benn's call).
- Search = **full advanced panel** (NL query + location/radius + time window + type/sources +
  suppression strictness dial + notify frequency/quiet hours + include/exclude keywords).
- This session: implement the redesign on frontend files; keep structured params frontend-local
  (localStorage) to avoid colliding with backend; only enrich the `createWatch` query text.

---

## RUNNING LOG
- **2026-06-21** — Cloned repo to `LookUpBennTask`, ran mock frontend (`:5174`). Reviewed full
  frontend + OAK docs. Wrote brainstorm/plan
  (`.windsurf/plans/lookout-frontend-redesign-f73112.md`). Backend tip = `a001629` (no new commits).
- **2026-06-21** — Phase 1: created this file.
- **2026-06-21** — Phase 2 (`581b6d1`): Search advanced panel — NL bar + collapsible advanced
  controls (location/radius, time window, type/sources, suppression-strictness dial, notify
  frequency + quiet hours, include/exclude keyword chips) building a structured `searchSpec`;
  `main.js composeQuery` now turns the spec into a richer query string (createWatch signature
  unchanged → mock/real parity kept).
- **2026-06-21** — Phase 3 (`16d8bc7`): Stay redesign — dominant "surfaced · silenced" ratio
  card + proportion bar, three distinct sections (surfaced / dup / off-topic), liveness strip,
  precision sparkline (reused `precisionCurve.js`, fed by `curve_update`), pipeline now on-demand.
  Small backward-compatible `mock.js` change: semantic duplicates emit `state: 'duplicate'` so
  "duplicates silenced" is provable. Documented the optional `state:'duplicate'` in INTEGRATION.md.
- **2026-06-21** — Phase 4 (`1edd5e8`): Report/Delivery — mock login (name/email in localStorage,
  no auth), per-channel target fields + Test-send stub, generic AI-agent connectors
  (Claude / MCP / Custom templates, endpoint+token, enable toggle, "what it receives" JSON
  preview), all persisted to localStorage. Progress-tracking intentionally omitted per Benn.
- **2026-06-21** — Phase 5: INTEGRATION.md note for `state:'duplicate'`; build verified clean
  (20 modules); pushed branch.
- **2026-06-21** — searchSpec→backend (`ec30e22`): `createWatch(queryText, spec?)` now sends
  `search_spec` alongside `query_text` (real + mock parity; additive so backend can ignore it).
  Documented the spec shape in INTEGRATION.md for Oak.
- **2026-06-21** — FULL REDESIGN to monopo saigon (light editorial): Benn changed direction —
  copy ONLY the monopo saigon ref (Paper White #fff / Ink Black #000, Roobert + Raleway, big
  display type, whitespace, square corners, near-monochrome). Flipped `theme.css` tokens to a light
  paper/ink monochrome system (cascades through all var()-based components), fonts → **Schibsted
  Grotesk** (≈ Roobert) + **Raleway** (display headlines); fixed hardcoded dark surfaces in
  `main.css` (header/status-pill/panel/card/pipeline), added a "MONOPO EDITORIAL OVERRIDES" block at
  the end of `pages.css` (underlined nav, huge Raleway hero, square pills, removed lime/amber/blue →
  ink/grey, inverted ink JSON block), and recolored the precision-curve gradient to ink. Suppression
  hierarchy now reads via black-vs-grey + fills instead of hue. Core tech/functions untouched.
  NOTE: this supersedes the earlier Analogue-leaning polish below.
- **2026-06-21** — Visual polish (`0c362f7`): combined two refero refs Benn picked —
  **Analogue** (dark agency: ink/graphite + LCDDot) and **monopo saigon** (editorial grotesque).
  Synthesis = "monochrome instrument with editorial confidence": true-black + graphite surfaces,
  **Space Grotesk** headings (dropped PT Serif), **JetBrains Mono** technical labels, **DotGothic16**
  LCD dot-matrix font restricted to the live suppression counters (Stay ratio + stat tiles), lime
  kept as the single brand accent, tighter radii (18→14), bigger hero scale + more whitespace.
  Reasoning + self-critique loop captured in chat. NEXT: get Oak's eyes / real UI refs to refine.

## SUPPRESSION-ENGINE GOAL CHECK (where we are vs the big picture)
- SEARCH now lets the user *scope precisely* — including the suppression-strictness dial that is
  literally the product's core tunable. ✅
- STAY now *makes suppression visible* (surfaced vs silenced, duplicates vs off-topic, quieter
  over time via the curve) — the "notify you less" story is legible at a glance. ✅
- REPORT now *closes the loop quietly* and lets any AI agent receive survivors (generic connectors)
  + (mock) ties delivery to a user. ✅
- NEXT: confirm Oak's example→watchId mapping for live mode (so "events near me" shows surfaced
  items, not an all-silenced watch); optionally wire structured `searchSpec` to a real backend
  param once Oak is ready; visual polish once Oak shares UI references.
