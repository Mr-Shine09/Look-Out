# PROGRESS — Oak (Real Data + Browserbase + Deploy)

Branch: `feat/luma-scrape-source` (stacked on `feat/infra-tracing`)
Last updated: 2026-06-21 06:08 PT (Session 2)

> **Read SESSION 2 first** (below) for the latest state: core bug fixes, spec-edit API,
> and the Search -> Stay -> Report UX redesign. Sections 1-5 are the earlier real-data/
> Browserbase session and remain accurate for the scraper.

> This session added **real event data** to Lookout via a Luma scraper (Browserbase +
> `requests` fallback), an **env-driven mock/real frontend seam**, a **mock-mode static
> deploy** config, and a **CORS fix** for local dev. Below is what's done, how to run it,
> and the remaining steps / bottlenecks.

---

## SESSION 2 (Jun 21, ~06:00 PT) — core bug fixes, spec-edit API, UX redesign

All work is on branch `feat/luma-scrape-source`, pushed to origin. Backend untouched in spirit
(each topic is still a watch/spec with Redis vector dedup under the hood).

### A. Core bug fixes + grounded pipeline — commit `263df0f`
- **BUG-1 (curve didn't fall cleanly):** `get_curve(watch_id)` now returns a single watch's
  series (default = most-accepted "primary" watch); `feedback`/`find_candidate` are watch-aware
  (prefer the accepted, non-duplicate copy; accept an explicit `watch_id`). Verified: feedback
  holds at 0.198, no cross-watch bounce back to 0.33.
- **BUG-2 (board emptied on refresh):** added `GET /api/candidates` + `engine.list_candidates()`;
  frontend hydrates on load. Verified: 16 candidates rehydrate.
- **BUG-3 (new watch saw nothing / global cursor):** `source.snapshot()` + `engine.backfill_watch()`
  run on watch compile, so a new watch evaluates the known event pool immediately (capped to bound
  Claude cost).
- **Pipeline:** act-pipeline snippets now grounded in the real candidate's title/location/source/spec.

### B. Human-in-the-loop spec editing — commit `a4a95de`
- `PATCH /api/watches/{id}/spec` -> `engine.update_spec()` rewrites must_match/reject_cases and
  sets status=watching; rebroadcasts `spec_ready`. `real.js` + `mock.js` expose `updateSpec(watchId, spec)`.
- Verified: PATCH round-trip returns the updated watch.

### C. Front-end redesign: Search -> Stay -> Report — commit `f8bde7e`
Replaces the dense single-screen dashboard. ONE PAGE = ONE PURPOSE.
- `src/lib/router.js` (NEW): tiny hash router, one page visible at a time.
- `src/components/searchPage.js` (NEW): search bar + filter checkboxes (Where/When/Type) that refine
  the compiled query and keep the backend scoped; curated **example test cases** below. Research
  grants demoted to one optional example (off by default), not a co-equal lane.
- `src/components/stayPage.js` (NEW): suppression-engine framing — stat tiles (surfaced / duplicates
  silenced / off-topic filtered / total seen) + "show what it silenced" toggle. Reuses `CandidateCard`
  + `Pipeline`.
- `src/components/reportPage.js` (NEW): choose delivery channels (dashboard/email/Slack/webhook).
- `src/components/header.js`: now a Search/Stay/Report step nav; copy = "built to notify you less."
- `src/styles/pages.css` (NEW): on-brand with existing dark tokens (NEUTRAL first pass — awaiting
  Oak's visual references).
- `src/main.js`: orchestrates the three pages via the router; `scope {watchId,title}` carries the
  active topic across pages; example with a `watchId` reuses a seeded feed (instant, no tokens),
  typed query compiles a fresh feed.
- Old components (`board.js`, `lane.js`, `watchCreator.js`, `precisionCurve.js`) are **dormant**
  (no longer imported) but left in place.
- Build verified clean (19 modules).

### D. Open follow-ups from Session 2
- **Demo-data mapping:** in mock mode the demo looks great (seed has surfaced items). In LIVE mode,
  the "events near me" example maps to watch `w_ml_hack`, whose current Redis data is mostly
  *silenced* — good for showing suppression, but if we want guaranteed surfaced cards we should map
  the example to the watch that has accepted candidates, or seed one. Oak to provide the few demo
  test cases; then wire the example->watchId mappings exactly.
- **Visual styling:** `pages.css` is a neutral pass; refine once Oak shares UI/UX references.

---

## MEMORY EXPORT (for syncing with a teammate)

These are the persistent memories I'm working from. Share this block so we stay aligned.

**Memory 1 — Lookout pitch & positioning (suppression engine)**
- Lookout = a SUPPRESSION ENGINE, not a watcher. Category claim: "Every alert tool is built to
  notify you MORE. Lookout is the first built to notify you LESS." It remembers what it already told
  you and stays quiet; gets quieter & sharper the longer it runs.
- For every detected change it asks two questions: (1) have I effectively shown this to you before?
  (semantic duplicate), and (2) does it actually matter? It only alerts when BOTH clear the bar.
- Redis (RediSearch) IS the suppression engine: every alert stored as a vector; hybrid KNN checks
  new candidates against alert history for semantic duplicates. Core product, not caching.
- Anthropic API: embeddings + relevance judging. Browserbase: web-watching/fetch. WebSocket: pushes
  surviving alerts in real time. Sentry: observability/error monitoring.
- The tunable semantic-similarity threshold for dedup IS the product (too loose = Google Alerts;
  too tight = miss real updates). What's next: per-user feedback to tune a personal threshold;
  extend to any changing source (status pages, filings, restocks, Reddit/Discord/APIs).
- Preferred elevator pitch (#1): "Every alert tool is built to notify you more. Lookout is the first
  built to notify you less."

**Memory 2 — UX direction: Search + Stay + Report**
- Core idea = SEARCH + STAY + REPORT. ONE PAGE = ONE PURPOSE (multi-page/step flow; clean, minimal,
  search-first).
- SEARCH (front door): prominent search bar to type the exact thing to watch; filter
  options/checkboxes narrow scope (and constrain the backend to avoid random noise). Below: examples
  / suggested test cases of what Lookout can do. For the DEMO use only a few curated test cases that
  map to existing watches.
- STAY: Lookout watches continuously and SUPPRESSES noise; show surviving alerts + how much was
  suppressed; gets quieter over time.
- REPORT: let the user route results to themselves via different channels (dashboard, email, etc.).
- "Research grants" must NOT be a co-equal default lane — it's one optional example; default surfaced
  thing is "new events near me." Build structure/flow first with neutral styling; refine visuals when
  Oak's references arrive. Backend (watch/spec/Redis dedup) stays intact under the hood.

> Note: "subDevin" — this IDE has no separate parallel agent to spawn. The closest is a Fast Context
> search subagent used for codebase exploration; all track work is driven directly.

---

## PARALLEL-WORK GUIDE (so two people don't collide)

Current running state (Oak's laptop): backend on `:8000` (real Luma scrape, Browserbase on, local
Redis, Phoenix+Sentry), frontend on `:5173` (`VITE_USE_REAL_BACKEND=true VITE_API_BASE=http://127.0.0.1:8000`).
Relaunch commands are in `OAK-STANDING-ORDERS.md`.

- **Frontend / UX (safe to own):** `src/components/searchPage.js`, `stayPage.js`, `reportPage.js`,
  `src/styles/pages.css`, `src/lib/router.js`, `src/components/header.js`. Visual polish + demo copy.
- **Backend / data (safe to own):** `lookout/engine.py`, `app.py`, `judge.py`, `scrape_source.py`,
  demo-data seeding + example->watchId mappings, match-rate tuning.
- **Shared seam — coordinate before editing:** `src/main.js` (page orchestration + filter->query
  mapping) and `src/api/{real,mock}.js` (the API contract; keep mock and real in parity).
- Pull `feat/luma-scrape-source` before starting; commit small and push often.

---

## 1. What's done this session (Session 1 — real data + Browserbase)

### Real event source — `lookout/scrape_source.py` (NEW)
- `ScrapeEventSource` implements the same `poll()` contract as `SeedEventSource` (drop-in).
- Scrapes Luma discovery pages (default `https://lu.ma/sf`), parses the server-rendered
  `<script id="__NEXT_DATA__">` JSON at `props.pageProps.initialData.data.events[].event`.
- Maps each event → Lookout schema: `id=luma-{api_id}`, `title`, `source=Luma`,
  `url=https://lu.ma/{slug}`, `starts_at`, `location` (from `geo_address_info`), `status=open`,
  `description` (synthesized).
- Caches results to `data/scraped_events.json` (git-ignored); refreshes every
  `scrape_refresh_seconds` (default 1800) to avoid re-hitting the network / Browserbase.
- **Fetch transport:** Browserbase (Playwright over CDP) when `LOOKOUT_USE_BROWSERBASE=1`
  and creds present; otherwise plain `requests`. Luma server-renders, so both yield identical data.
- **Verified:** live backend scraped `lu.ma/sf` through a real Browserbase session
  (`browserbase=on`, `[scrape] fetched via Browserbase`) → 20 real SF events → judged →
  accepted real ones (*BoltzMol API Launch*, *The Global State of Deep Tech*); parties/networking rejected.

### Wiring — `lookout/settings.py` + `lookout/app.py`
- New settings behind env flags (default = `seed`, fully backward compatible / merge-safe):
  `LOOKOUT_EVENT_SOURCE`, `LOOKOUT_SCRAPE_SOURCES`, `LOOKOUT_SCRAPE_CACHE`,
  `LOOKOUT_SCRAPE_REFRESH_SECONDS`, `LOOKOUT_USE_BROWSERBASE`, `BROWSERBASE_API_KEY`,
  `BROWSERBASE_PROJECT_ID`.
- `app.py` lifespan picks `ScrapeEventSource` vs `SeedEventSource` from `LOOKOUT_EVENT_SOURCE`.

### Frontend seam — `src/api/index.js`
- Mock/real switch is now **env-driven**: `VITE_USE_REAL_BACKEND` (defaults to mock for
  safe static deploys). Local dev opts into the real backend; the public build stays mock.

### Deploy config — `netlify.toml` (NEW)
- `npm run build` → publish `dist`; SPA redirect. Public build ships the self-contained mock API.

### Dependencies — `requirements.txt`
- Added `requests`, `browserbase>=1.13.0`, `playwright>=1.40.0` (Playwright needs **no** browser
  binaries — we connect to a remote Browserbase session over CDP).

### CORS fix (runtime only — see bottleneck #2)
- Frontend was hanging on load because the **browser-preview proxy origin** (`127.0.0.1:5xxxx`)
  was not in the CORS allowlist (`localhost:5173` / `127.0.0.1:5173` only) → API calls blocked.
- Worked around by starting the backend with `LOOKOUT_CORS_ORIGINS='*'`. **Not yet in code.**

---

## 2. How to run the full stack (real data)

```bash
# 0. Infra (once)
docker run -d -p 6006:6006 --name phoenix arizephoenix/phoenix:latest   # Phoenix
# Redis Stack on :6379 (local) must be running

# 1. Backend — real Luma data via Browserbase (CORS now allows any localhost
#    origin by default, including the IDE preview proxy — no override needed)
set -a; . ./.env; set +a
REDIS_URL=redis://localhost:6379 \
LOOKOUT_EVENT_SOURCE=scrape \
LOOKOUT_USE_BROWSERBASE=1 \
LOOKOUT_POLL_SECONDS=3600 \
LOOKOUT_EVENT_BATCH_SIZE=8 \
./venv-backend/bin/uvicorn lookout.app:app --host 127.0.0.1 --port 8000

# 2. Frontend — point at the real backend
VITE_USE_REAL_BACKEND=true node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort

# 3. In the browser console, trigger a scrape + judge sweep:
#    lookout.fire()
```

Health: `curl http://localhost:8000/health` → `{"ok":true,"redis":true,...}`
(Note: `http://localhost:8000/` returning `{"detail":"Not Found"}` is **normal** — no `/` route.)

To use the **direct-fetch** path instead of Browserbase (zero quota), drop `LOOKOUT_USE_BROWSERBASE=1`.

---

## 3. Remaining steps (TODO)

| # | Item | Owner | Notes |
|---|------|-------|-------|
| 1 | **Public deploy** | Oak | Managed one-click deploy hit a provider **outage**. Finish via: `npx netlify-cli deploy --dir=dist --prod` in a real terminal (interactive login + create-site). `dist/` already built (mock mode); `netlify.toml` in place. |
| 2 | ~~**Persist CORS for dev**~~ ✅ DONE | Oak | Fixed in code: `settings.cors_origin_regex` (default `https?://(localhost|127.0.0.1)(:\d+)?`) wired into the CORS middleware in `app.py`. Any localhost port — including the IDE preview proxy — is allowed without `'*'`. Override via `LOOKOUT_CORS_ORIGIN_REGEX`. |
| 3 | **Spec human-in-the-loop edit** | Harrison + Bruce | Backend already splits create→compile; needs `PATCH /api/watches/{id}/spec` + "Confirm" gating, and editable chips in the UI (don't show spec until "Compile," lock on confirm). |
| 4 | **Tune match rate on real data** | Bruce | Judge is strict; most Luma SF events (parties/networking) reject. Add sources (`lu.ma/ai`, city pages) and/or loosen specs so more real events accept in the demo. |
| 5 | **Merge** | Oak | Merge order: `feat/luma-scrape-source` stacks on `feat/infra-tracing`. Touches `app.py`/`settings.py` (Bruce) + `src/api/index.js`/`vite.config.js` (Harrison) — coordinate before merging to `main`. |

---

## 3b. Infra verification status (agenda Definition of Done)

- ✅ **`verify.py` gate** restored to this branch + **Sentry check added**; Browserbase check is
  now opt-in (`VERIFY_BROWSERBASE=1`) to protect the 60-min/mo quota. Green with local Redis:
  `REDIS_URL=redis://localhost:6379 ./venv-backend/bin/python verify.py` → Claude/Redis/Phoenix/Sentry PASS, Browserbase SKIP.
- ✅ **Phoenix tracing active** (`[tracing] Phoenix tracing active -> http://localhost:6006`); agent spans emit on scout/judge/pipeline.
- ✅ **Sentry capturing backend errors** — confirmed via `GET /api/debug/error` (error flows through the Sentry FastAPI integration).
- ⚠️ **Curve is flat (0.33), not yet falling.** The falling-precision proof needs feedback: accept candidates, then mark a few `not_relevant` → `recompute_curve` lowers the rate. Exercise this during the demo (or seed feedback).
- ⚠️ **`.env` `REDIS_URL` points at Redis Cloud** (times out on venue WiFi + lacks the Search module). The demo runs on **local Redis Stack** (`redis://localhost:6379`). Keep using the local override for verify + backend.

---

## 4. Bottlenecks / known issues

- **Browserbase quota (60 min/month).** Each live scrape burns a session. The disk cache
  (`refresh=1800s`) limits this; forcing a rescrape = delete `data/scraped_events.json` first.
  Dev iteration used the `requests` path + cached HTML to conserve minutes.
- **Global event cursor (not per-watch).** Events are consumed once across all watches, so a
  watch created *after* events are consumed misses them. For a clean live demo: **create the
  watch(es) before `lookout.fire()`**. Proper fix = per-watch replay or a backfill on watch create.
- **No candidate backfill on page load.** Candidates arrive only via WebSocket; refreshing the
  browser drops already-processed candidates. Fix = a `GET /api/candidates` endpoint that `main.js`
  hydrates from on init.
- **Deploy is laptop-bound for real data.** The deployed frontend is **mock-mode** (self-contained).
  A public site on the *real* backend would need a tunnel (cloudflared) + `wss` + CORS for the
  deployed origin, and only works while the laptop + tunnel run.
- **Luma description depth.** Only list-level fields are available; full descriptions require a
  per-event page fetch (more requests / quota). Current `description` is synthesized from
  title + location + type + start time — enough for embedding/judge, thin for display.
- **Provider outage.** The managed deploy service returned internal server errors repeatedly
  (their side). Retry later or use the CLI (TODO #1).

---

## 5. Quick verification checklist

- [ ] `curl http://localhost:8000/health` → all true
- [ ] `curl http://localhost:8000/api/watches` → returns watches JSON
- [ ] Frontend at `http://localhost:5173` loads lanes (hard-refresh after CORS change)
- [ ] `lookout.fire()` streams real Luma events into lanes
- [ ] `grep "fetched via Browserbase" /tmp/lookout-backend.log` confirms Browserbase path
- [ ] Public deploy URL live (after TODO #1)
