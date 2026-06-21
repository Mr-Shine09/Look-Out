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
