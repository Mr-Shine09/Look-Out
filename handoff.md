# Lookout — Handoff

> **Purpose.** A single, self-contained handoff so anyone (including my Claude app /
> Claude Code) can pick up Lookout with zero prior context: what it is, how it's built,
> what's done, what's next, how to run it, and what I need to re-provision now that some
> free trials expired.

- **Last worked on:** 2026-07-01
- **GitHub:** https://github.com/BennPhu/Look-Out
- **Active branch:** `feat/luma-scrape-source` (stacked history on `feat/infra-tracing`)
- **Last commit:** `3bd3f16` (2026-06-21) — merge on `feat/luma-scrape-source`
- **Owner:** Oak (orchestration + product + backend). Frontend/UX track: Benn.

---

## 1. What Lookout is (product overview)

**Lookout is a suppression engine for alerts.** Category claim: *"Every alert tool is
built to notify you MORE. Lookout is the first built to notify you LESS."* It watches
sources (events, hackathons, funding) and, for every candidate, asks two questions:

1. **Have I effectively shown you this before?** — semantic duplicate check via Redis
   vector KNN (RediSearch).
2. **Does it actually matter?** — relevance judged by an Anthropic (Claude) model.

It only surfaces an alert when **both** clear the bar. It gets quieter and sharper the
longer it runs. The tunable **semantic-similarity threshold** for dedup IS the product
(too loose = Google Alerts noise; too tight = miss real updates).

**UX model = Search -> Stay -> Report** (one page = one purpose):
- **Search** — front door; type exactly what to watch + advanced filters (location/radius,
  time window, type/sources, suppression-strictness dial, notify frequency, keyword
  include/exclude).
- **Stay** — watches continuously and makes suppression *visible* (surfaced vs silenced,
  duplicates vs off-topic, precision curve falling over time).
- **Report** — route surviving alerts to channels (dashboard, email, Slack/Discord
  webhook, generic AI-agent connectors).

---

## 2. Tech stack

**Frontend**
- Vanilla JS + **Vite 5** (no framework). Custom hash router (`src/lib/router.js`).
- Styling: CSS design tokens (`src/styles/theme.css`, `main.css`, `pages.css`) — light
  editorial "monopo saigon" monochrome direction.
- API seam: `src/api/{index,real,mock}.js` — env-driven mock/real switch.

**Backend** (Python 3.11, `lookout/` package)
- **FastAPI** + **Uvicorn** (ASGI), WebSocket live feed (`/ws/feed`).
- **Redis Stack** (RediSearch) — vector store + suppression engine (`redis_store.py`,
  `embeddings.py`).
- **Anthropic (Claude)** — relevance judge + embeddings (`judge.py`, `embeddings.py`).
- **Event sources:** `scrape_source.py` (Luma), `devpost_source.py`, `search_source.py`
  (Tavily), `event_source.py` (seed). Selected via `LOOKOUT_EVENT_SOURCE`.
- **Browserbase** (Playwright over CDP) — remote browser fetch transport for scraping.
- **APScheduler** — periodic scout polling.
- Learning/feedback loop: `learning.py`, `engine.py` (curve recompute, dedup, backfill).

**Observability**
- **Arize Phoenix** (OTel) — agent tracing UI on `:6006` (`tracing.py`).
- **Sentry** — backend error monitoring (FastAPI integration).

**Deploy**
- `netlify.toml` — static frontend build (mock mode) to Netlify. Real backend is
  currently laptop-bound.

### ⚠️ Credentials to RE-PROVISION (free trials expired)
> These MUST be reset before the real-data stack works again. Put fresh values in `.env`
> (see `.env` keys below). **Do not commit `.env`** (it's gitignored).

| Service | Status | Action needed |
|---|---|---|
| **Anthropic (Claude API)** | ❌ expired | New API key -> `ANTHROPIC_API_KEY`. Without it, judge/embeddings fail. |
| **Browserbase** | ❌ expired | New API key + project id -> `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`. Or run without it: drop `LOOKOUT_USE_BROWSERBASE=1` to use the plain `requests` fetch path (Luma server-renders, so this still works). |
| **Redis** | ❌ expired (Cloud) | Either spin up **local Redis Stack** on `:6379` (recommended, what the demo used) or provision a new Redis Cloud DB with the Search module, then set `REDIS_URL`. |
| **Sentry** | ✅ still active | `SENTRY_DSN` still valid — no action. |

`.env` keys currently expected:
```
ANTHROPIC_API_KEY=      # reset
BROWSERBASE_API_KEY=    # reset
BROWSERBASE_PROJECT_ID= # reset
REDIS_URL=              # reset / point at local redis
SENTRY_DSN=             # still valid
LOOKOUT_DISCORD_WEBHOOK=# optional notify target
```

---

## 3. Repository layout

```
lookout/                      # Python backend package
  app.py                      # FastAPI app + all routes (/health, /api/*, /ws/feed)
  engine.py                   # core: watches, dedup, feedback, curve, backfill
  judge.py                    # Anthropic relevance judge
  embeddings.py               # embeddings for vector dedup
  redis_store.py              # Redis (RediSearch) vector store
  scrape_source.py            # Luma scraper (Browserbase or requests)
  devpost_source.py / search_source.py / event_source.py
  notify.py                   # delivery channels (webhook/discord/in-app)
  learning.py, tracing.py, websocket.py, settings.py, schemas.py
src/                          # frontend (Vite)
  main.js                     # page orchestration + live feed dispatch
  api/{index,real,mock}.js    # API seam (env-driven mock/real)
  components/{searchPage,stayPage,reportPage,header,candidateCard,pipeline,...}.js
  lib/{router,dom,notify,backdrop}.js
  styles/{theme,main,pages}.css
requirements.txt              # Python deps
package.json / vite.config.js # frontend deps/build
netlify.toml                  # static deploy config
verify.py                     # infra smoke-test gate
data/                         # scraped_events.json cache (gitignored)
venv-backend/                 # Python venv used to run the backend
```

---

## 4. Current state

**Running services (on my laptop during last session):**
- Backend `:8000` (FastAPI/uvicorn), Frontend `:5173` (Vite), Phoenix `:6006`,
  local Redis `:6379`. NOTE: these will NOT run until credentials above are reset.

**Data (local Redis, last session):** 16 watches, ~1300 candidates, all with real Luma
thumbnails. This lives only in local Redis and is not committed.

**Git working tree (uncommitted / untracked — decide before pushing):**
- Modified: `src/components/reportPage.js` (incomplete edit: relabel "Slack / Discord"
  -> "Discord / Slack" + Discord webhook placeholder).
- Untracked: `presentation/`, `scripts/serve-public.sh`, `lookout-deck.zip`,
  progress notes (`PROGRESS-OAK.md`, `PROGRESS_BENN.md` — gitignored), `handoff.md`.

**Verified working recently:**
- Frontend builds clean (`vite build`, ~23 modules).
- Backend `/health` returns `{"ok":true,"redis":true,"index":true}` on current code.
- Endpoints: `/api/watches`, `/api/candidates`, `/api/curve`, `/api/scout/run`,
  `PATCH /api/watches/{id}/spec`, feedback/apply/pipeline, `/api/delivery`, `/api/profile`.

---

## 5. What we've done (recent log)

- **2026-06-21 (Session 2):** core bug fixes (curve falls cleanly per-watch; board
  rehydrates via `GET /api/candidates`; new watch backfills the known event pool);
  human-in-the-loop spec editing (`PATCH /api/watches/{id}/spec`); Search->Stay->Report
  redesign (router + three pages); monochrome editorial visual pass.
- **2026-06-24:** re-oriented on the repo; found the live backend was serving **stale
  code** (old process without `/health`). Root-caused it, restarted the backend on current
  code with the real-data config, verified `/health` = 200, brought up the frontend.
- **2026-06-30:** confirmed all services up and that the **Redis data was intact** (the
  "I deleted the DB" scare was a false alarm — local Redis was fine). Verified 1300/1300
  candidates carry real Luma thumbnails (groundwork for the sliding event strip).

---

## 6. What's planned (TODO / roadmap)

**Next up (requested, not yet built):**
1. **Sliding event thumbnails** — a YouTube-style auto-scrolling strip of real event
   cards (data already supports it: `candidateCard.js` reads `thumbnail`+`url`,
   1300/1300 candidates have images). Placement TBD (Search landing vs. new Overview page).
2. **Dynamic overview page** — a live overview (event strip + high-level stats:
   surfaced vs silenced, sources, counts).
3. **Refine project overview + push working code to GitHub** — clean README/overview,
   resolve the uncommitted `reportPage.js` edit, then commit/push.

**Backend / data:**
4. **Match-rate tuning** — judge is strict; most Luma SF events (parties/networking)
   reject. Add sources (`lu.ma/ai`, city pages) and/or loosen specs for the demo.
5. **Spec human-in-the-loop UI** — surface editable spec chips; don't show spec until
   "Compile," lock on "Confirm" (API already supports `PATCH .../spec`).

**Infra / deploy:**
6. **Public deploy** — finish Netlify CLI deploy of the mock-mode frontend
   (`npx netlify-cli deploy --dir=dist --prod`); for real backend need a tunnel
   (cloudflared) + `wss` + CORS for the deployed origin.
7. **Merge** — order: `feat/luma-scrape-source` stacks on `feat/infra-tracing` -> `main`.

---

## 7. How to run the full stack (after resetting credentials)

```bash
# 0. Infra
#   - Redis Stack on :6379 (local Docker or install), OR a Redis Cloud URL with Search
docker run -d -p 6006:6006 --name phoenix arizephoenix/phoenix:latest   # Phoenix (optional)

# 1. Backend (real Luma data). Drop LOOKOUT_USE_BROWSERBASE=1 to skip Browserbase.
set -a; . ./.env; set +a
REDIS_URL=redis://localhost:6379 \
LOOKOUT_EVENT_SOURCE=scrape \
LOOKOUT_USE_BROWSERBASE=1 \
LOOKOUT_POLL_SECONDS=3600 \
LOOKOUT_EVENT_BATCH_SIZE=8 \
./venv-backend/bin/uvicorn lookout.app:app --host 127.0.0.1 --port 8000

# 2. Frontend (point at the real backend)
VITE_USE_REAL_BACKEND=true VITE_API_BASE=http://127.0.0.1:8000 \
node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort

# 3. Trigger a scout sweep from the browser console:
#    lookout.fire()
```

- Health check: `curl http://localhost:8000/health` -> `{"ok":true,"redis":true,"index":true}`
- Infra gate: `REDIS_URL=redis://localhost:6379 ./venv-backend/bin/python verify.py`
- Frontend-only (mock, no backend/keys needed): `npm run dev` (defaults to mock API).

---

## 8. Known issues / bottlenecks

- **Stale-process trap:** if `/health` 404s but `/api/*` works, an OLD uvicorn process is
  serving pre-`/health` code — kill it and relaunch on current code.
- **Browserbase quota** (free trial): each live scrape burns a session; disk cache
  (`data/scraped_events.json`, refresh 1800s) limits this. Delete the cache to force a
  rescrape. Use the `requests` path to avoid quota entirely.
- **Global event cursor** (not per-watch): create watches *before* firing a sweep, or the
  new watch may miss already-consumed events (mitigated by `backfill_watch` on compile).
- **Public deploy is mock-mode**; real backend needs a tunnel + CORS for the deployed origin.
- **Uncommitted `reportPage.js`** edit is incomplete — finish or revert before pushing.

---

## 9. Handoff checklist for the next agent

- [ ] Reset **Anthropic**, **Browserbase**, **Redis** credentials in `.env` (Sentry OK).
- [ ] Start Redis (local `:6379`) + confirm `verify.py` passes.
- [ ] Launch backend + frontend (Section 7); confirm `/health` is green.
- [ ] Decide on the uncommitted `reportPage.js` change (finish or revert).
- [ ] Build the sliding event-thumbnail strip + dynamic overview page (Section 6.1–6.2).
- [ ] Refine README/overview, commit, and push to `feat/luma-scrape-source`.
- [ ] Repo: https://github.com/BennPhu/Look-Out
