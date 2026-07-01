# Lookout — Handoff

> **Purpose.** A single, self-contained handoff so anyone (including my Claude app /
> Claude Code) can pick up Lookout with zero prior context: what it is, how it's built,
> what's done, what's next, and how to run it.

- **Last worked on:** 2026-07-01
- **GitHub:** https://github.com/BennPhu/Look-Out
- **Active branch:** `feat/luma-scrape-source` (stacked history on `feat/infra-tracing`)
- **Last commit:** `45be717` (2026-07-01) — pushed to origin, working tree clean.
- **Owner:** Oak (orchestration + product + backend). Frontend/UX track: Benn.

---

## 1. What Lookout is (product overview)

**Lookout is a suppression engine for alerts.** Category claim: *"Every alert tool is
built to notify you MORE. Lookout is the first built to notify you LESS."* It watches
sources (events, hackathons, funding) and, for every candidate, asks two questions:

1. **Have I effectively shown you this before?** — semantic duplicate check via Redis
   vector KNN (RediSearch).
2. **Does it actually matter?** — relevance judged by an LLM (local **Ollama** by
   default now — see Section 2).

It only surfaces an alert when **both** clear the bar, **and** the event hasn't already
happened (see the freshness fix in Section 5). It gets quieter and sharper the longer it
runs. The tunable **semantic-similarity threshold** for dedup IS the product (too loose =
Google Alerts noise; too tight = miss real updates).

**UX model = Search -> Stay -> Report** (one page = one purpose):
- **Search** — front door; type exactly what to watch + advanced filters (location/radius,
  time window, type/sources, suppression-strictness dial, notify frequency, keyword
  include/exclude).
- **Stay** — watches continuously and makes suppression *visible* (surfaced vs silenced —
  duplicates, off-topic, **and now "already passed"** — precision curve falling over
  time). Has **Stop watching / Resume watching** and **New search** controls.
- **Report** — route surviving alerts to channels (dashboard, email, Discord webhook,
  generic webhook).

---

## 2. Tech stack (re-provisioned 2026-07-01 — see Section 5 for why)

**Frontend**
- Vanilla JS + **Vite 5** (no framework). Custom hash router (`src/lib/router.js`).
- Styling: CSS design tokens (`src/styles/theme.css`, `main.css`, `pages.css`).
- API seam: `src/api/{index,real,mock}.js` — env-driven mock/real switch.

**Backend** (Python 3.11, `lookout/` package)
- **FastAPI** + **Uvicorn** (ASGI), WebSocket live feed (`/ws/feed`).
- **Redis Stack** (RediSearch) — the actual datastore (watches, candidates, feedback,
  curve) *and* the vector KNN dedup index, not just a cache. Runs **locally via
  Homebrew** (`redis-stack-server`), free, no cloud account needed. Start with
  `brew services start redis-stack-server` or run `redis-stack-server` in the
  foreground; stop with `brew services stop redis-stack-server` when not in use —
  costs nothing either way.
- **Judge LLM — now pluggable** (`lookout/judge.py`, `LOOKOUT_JUDGE_PROVIDER` env var):
  - `ollama` (**new default going forward**) — local, free, no API key. Installed via
    `brew install ollama`, running as a brew service on `:11434`, model
    `llama3.1:8b` (~4.9GB) pulled via `ollama pull llama3.1:8b`.
  - `anthropic` — original Claude path, kept for whoever wants to pay for better
    judgment quality. **Current `ANTHROPIC_API_KEY` in `.env` is confirmed dead**
    (401 invalid key) — would need a fresh key to use this path again.
  - `stub` — deterministic regex heuristic, no LLM, always available as a last resort.
  - `auto` (default when unset) — picks `anthropic` if a key is present, else `stub`.
    Explicitly set `LOOKOUT_JUDGE_PROVIDER=ollama` to use the free local model.
- **Embeddings** — `sentence-transformers/all-MiniLM-L6-v2`, already fully local, never
  touched Anthropic. No change needed here.
- **Event sources:** `scrape_source.py` (Luma), `devpost_source.py`, `search_source.py`
  (Tavily), `event_source.py` (seed). Selected via `LOOKOUT_EVENT_SOURCE`.
- **Browserbase** (Playwright over CDP) — **off by default**
  (`LOOKOUT_USE_BROWSERBASE=0`). Luma's discovery pages are server-rendered, so the
  plain `requests` fetch path returns identical data for free. Free tier is 1
  browser-hour/month — plenty if you ever need it for a harder-to-scrape source, but
  there's no reason to pay for a paid plan for this project's current scraping needs.
- **APScheduler** — periodic scout polling.
- Learning/feedback loop: `learning.py`, `engine.py` (curve recompute, dedup, backfill,
  freshness gate).

**Observability / notify**
- **Arize Phoenix** (OTel) — agent tracing UI on `:6006` (`tracing.py`).
- **Sentry** — backend error monitoring. **Confirmed live and valid** via `verify.py`
  (`DSN valid, client active`) — GitHub Student Pack plan, no action needed.
- **Discord webhook** — `LOOKOUT_DISCORD_WEBHOOK`, already fully wired in `notify.py`
  (rich embeds). Confirmed shape-valid via `verify.py`. No code changes were needed —
  Sentry and Discord were both already fully implemented, just needed the env values.

**Deploy**
- `netlify.toml` — static frontend build (mock mode) to Netlify. Real backend is
  currently laptop-bound.

### Cost/ownership summary (the whole point of today's re-provisioning)
| Service | Decision | Cost |
|---|---|---|
| Judge LLM | Default to local **Ollama** (`llama3.1:8b`); Claude still supported if re-keyed | $0 |
| Embeddings | Already local (`sentence-transformers`) | $0 |
| Browserbase | Off by default; `requests` fallback is equivalent for Luma | $0 |
| Redis | Local Homebrew `redis-stack-server`, run only while in use | $0 |
| Sentry | GitHub Student Pack plan | $0 |
| Discord | Webhook, free | $0 |

`.env` keys currently expected (see `.env.example`, now committed):
```
ANTHROPIC_API_KEY=       # dead/optional — only needed if LOOKOUT_JUDGE_PROVIDER=anthropic
LOOKOUT_JUDGE_PROVIDER=ollama
LOOKOUT_OLLAMA_HOST=http://localhost:11434
LOOKOUT_OLLAMA_MODEL=llama3.1:8b
REDIS_URL=redis://localhost:6379
LOOKOUT_USE_BROWSERBASE=0
BROWSERBASE_API_KEY=     # optional
BROWSERBASE_PROJECT_ID=  # optional
SENTRY_DSN=              # valid, keep
PHOENIX_URL=http://localhost:6006
LOOKOUT_DISCORD_WEBHOOK= # valid, keep
LOOKOUT_WEBHOOK_URL=     # optional
```

---

## 3. Repository layout

```
lookout/                      # Python backend package
  app.py                      # FastAPI app + all routes (/health, /api/*, /ws/feed)
  engine.py                   # core: watches, dedup, feedback, curve, backfill, freshness gate
  judge.py                    # pluggable judge: anthropic | ollama | stub
  embeddings.py               # local embeddings for vector dedup
  redis_store.py              # Redis (RediSearch) vector store
  scrape_source.py            # Luma scraper (requests by default, Browserbase optional)
  devpost_source.py / search_source.py / event_source.py
  notify.py                   # delivery channels (Discord webhook / generic webhook / in-app)
  schemas.py                  # Pydantic request/response models (incl. WatchStatusUpdate)
  learning.py, tracing.py, websocket.py, settings.py
src/                          # frontend (Vite)
  main.js                     # page orchestration + live feed dispatch
  api/{index,real,mock}.js    # API seam (env-driven mock/real), incl. setWatchStatus
  components/{searchPage,stayPage,reportPage,header,candidateCard,pipeline,...}.js
  lib/{router,dom,notify,backdrop}.js
  styles/{theme,main,pages}.css
requirements.txt              # Python deps (now incl. httpx, python-dotenv for verify.py)
package.json / vite.config.js # frontend deps/build
netlify.toml                  # static deploy config
verify.py                     # infra smoke-test gate (Claude/Ollama/Redis/Browserbase/Phoenix/Sentry/Discord)
.env.example                  # committed template — copy to .env and fill in
.claude/launch.json           # one-command backend+frontend launch config (Claude Code preview tooling)
data/                         # scraped_events.json cache (gitignored)
venv-backend/                 # Python venv used to run the backend
```

---

## 4. Current state

**Not currently running** (stopped cleanly at end of session 2026-07-01, no orphaned
processes). To bring back up, see Section 6.

**Still running in the background (free, harmless to leave up):**
- `redis-stack-server` on `:6379` (Homebrew-installed, has been running since 2026-06-20).
- `ollama serve` on `:11434` (Homebrew service, `llama3.1:8b` pulled).

**Data (local Redis):** ~20 watches, ~1800+ candidates accumulated across sessions.
Lives only in local Redis, not committed. Includes a handful of duplicate/junk test
watches (query text `"-"`, near-duplicate "Hackathons in San Francisco" variants) from
before the double-submit bug was fixed (Section 5) — harmless, just clutter; no delete
endpoint exists yet if you want to clean them up.

**Verified working (2026-07-01):**
- `verify.py` fully green: Ollama reachable + model pulled, Redis PONG, Phoenix up,
  Sentry DSN valid, Discord webhook shape valid, Claude correctly skipped (not the
  active provider).
- Full stack booted end-to-end with `LOOKOUT_JUDGE_PROVIDER=ollama`,
  `LOOKOUT_EVENT_SOURCE=scrape`, `LOOKOUT_USE_BROWSERBASE=0`: real Luma scrape → local
  Ollama judge → Redis dedup → WebSocket → Stay page, all working.
- Frontend builds clean (`vite build`, 23 modules).

---

## 5. What we've done (recent log)

- **2026-06-21 (Session 2):** core bug fixes (curve falls cleanly per-watch; board
  rehydrates via `GET /api/candidates`; new watch backfills the known event pool);
  human-in-the-loop spec editing (`PATCH /api/watches/{id}/spec`); Search->Stay->Report
  redesign (router + three pages); monochrome editorial visual pass.
- **2026-06-24:** re-oriented on the repo; found the live backend was serving stale code
  (old process without `/health`). Root-caused, restarted on current code, verified.
- **2026-06-30:** confirmed all services up, Redis data intact, 1300/1300 candidates
  carry real Luma thumbnails.
- **2026-07-01 (this session) — tech-stack reset + real bugs found and fixed:**
  1. **Judge provider made pluggable** (`anthropic|ollama|stub|auto`); installed Ollama
     + `llama3.1:8b` locally as the free default. Confirmed the old `ANTHROPIC_API_KEY`
     is genuinely dead (401).
  2. **Judge prompt required two real rounds of tuning**, not just a transport swap —
     an 8B local model needs much more explicit instructions than Claude did:
     - Round 1: fixed malformed spec JSON (nested objects instead of plain strings)
       and made `reject_cases` a hard gate (was getting overridden by "be lenient").
     - Round 2 (caught via live testing, not assumption): the "treat must_match as
       soft" framing carried over from Claude's prompt made the model ignore topic
       matching almost entirely — it accepted a book club and a craft meetup as
       "AI/ML hackathons." Rewrote to require real textual evidence for topic
       must_match items and default to **reject when unsure** (silence over noise).
       Verified 8/8 on a labeled batch of real Luma candidates, up from ~2/6 live.
     - Also raised the Ollama request timeout (60s → 180s: Ollama serves one request
       at a time, so a burst of concurrent watch backfills was queuing past the old
       timeout) and made judge fallback-to-stub failures print a reason instead of
       failing silently.
  3. **Deterministic freshness gate** (`event_has_passed()` in `engine.py`): an event
     whose `starts_at` has already elapsed is now rejected before ever spending a judge
     call. "Upcoming or in-progress only" is the default, and it's free.
  4. **Caught mid-fix: freshness needs a *second* check, not just a gate.** A
     candidate accepted while still upcoming can go stale later just from sitting in
     the "surfaced" list — the one-time ingestion gate doesn't handle that. Confirmed
     against live data: 55 stored candidates were `judgment: accepted` with a
     `starts_at` already in the past (pre-dating the gate). Fixed by adding a
     **read-time `expired` field** to `_candidate_payload()` — recomputed on every
     fetch, never mutates the stored judgment (history stays intact) — and the
     frontend now buckets accepted-but-expired candidates into a new **"already
     passed"** stat/section instead of counting them as surfaced. Computed client-side
     at render time too, so it self-corrects without a refetch.
  5. **Watch stop/resume control**: `PATCH /api/watches/{id}/status`
     (`watching`/`stopped`); Stay page gained **"Stop watching"/"Resume watching"** and
     **"New search"** buttons. Motivated by local Ollama being much slower than a
     hosted API — previously a watch just polled forever with no way to pause it.
     (Bug caught in the same pass: a "compiling" transitional status was being
     mislabeled as "stopped" in the UI — fixed to only treat the literal `"stopped"`
     status as paused.)
  6. **Fixed a real, reproducible double-submit bug**: pressing Enter then
     reflexively clicking "Watch this" (or a rapid double-click) fired
     `commitSearch()` twice with no guard, creating two duplicate watches per
     submission. Combined with local Ollama's much slower backfill, this caused a
     race where the Stay page's `scope.watchId` could end up pointed at the wrong
     watch and drop the entire live candidate stream (observed live: a watch showed
     "0 total updates seen" for minutes despite the backend having fully processed 20
     candidates for it). Added a 1.5s resubmit guard in `searchPage.js`, verified by
     dispatching Enter+click together and confirming only one watch gets created.
     Also added a periodic (5s) REST resync poll in `stayPage.js` as a safety net,
     since local-Ollama backfill duration is no longer safely assumed to be
     "fast enough that the websocket alone will catch everything."
  7. Housekeeping: added `.env.example`, rewrote the README setup walkthrough,
     committed the previously-uncommitted `reportPage.js` relabel, `handoff.md`,
     `presentation/`, `scripts/serve-public.sh` (skipped `lookout-deck.zip` — binary,
     redundant with `presentation/`). All pushed to `origin/feat/luma-scrape-source`.

---

## 6. How to run the full stack

```bash
# 0. Infra (both free, no account needed)
brew services start redis-stack-server   # or: redis-stack-server & (foreground)
brew services start ollama               # serves on http://localhost:11434
# (llama3.1:8b already pulled; re-pull if needed: ollama pull llama3.1:8b)

# 1. Backend — local Ollama judge, requests-based Luma scrape (no Browserbase spend)
set -a; . ./.env; set +a
REDIS_URL=redis://localhost:6379 \
LOOKOUT_JUDGE_PROVIDER=ollama \
LOOKOUT_EVENT_SOURCE=scrape \
LOOKOUT_USE_BROWSERBASE=0 \
LOOKOUT_POLL_SECONDS=3600 \
LOOKOUT_EVENT_BATCH_SIZE=8 \
./venv-backend/bin/uvicorn lookout.app:app --host 127.0.0.1 --port 8000

# 2. Frontend (point at the real backend)
VITE_USE_REAL_BACKEND=true VITE_API_BASE=http://127.0.0.1:8000 \
node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort

# 3. Trigger a scout sweep from the browser console (or just create a watch —
#    compile_watch backfills automatically):
#    lookout.fire()
```

- Health check: `curl http://localhost:8000/health` -> `{"ok":true,"redis":true,"index":true}`
- Infra gate: `LOOKOUT_JUDGE_PROVIDER=ollama REDIS_URL=redis://localhost:6379 ./venv-backend/bin/python verify.py`
- Frontend-only (mock, no backend/keys needed): `npm run dev`.
- If using Claude Code with the preview tooling: `.claude/launch.json` already has
  `backend`/`frontend` configs wired to the commands above — just start them by name.

**Note on local Ollama speed:** a single watch backfill (~20 candidates) can take a
couple of minutes on CPU, vs. seconds with a hosted API. This is normal — the Stop
button and the resync fallback (Section 5.5–5.6) exist because of this.

---

## 7. What's planned (TODO / roadmap)

**Next up (requested, not yet built):**
1. **Sliding event thumbnails** — a YouTube-style auto-scrolling strip of real event
   cards (data already supports it: `candidateCard.js` reads `thumbnail`+`url`).
   Placement TBD (Search landing vs. new Overview page).
2. **Dynamic overview page** — a live overview (event strip + high-level stats:
   surfaced vs silenced, sources, counts).

**Backend / data:**
3. **Match-rate tuning, round 2** — now that the Ollama judge is strict-by-design
   (Section 5.2), watch real acceptance rates and see if it's now *too* strict on the
   local model vs. too lenient before; may need another calibration pass.
4. **Clean up junk watches** — no `DELETE /api/watches/{id}` endpoint exists yet;
   would help clear the pre-double-submit-fix duplicate watches sitting in Redis.
5. **Spec human-in-the-loop UI** — surface editable spec chips; don't show spec until
   "Compile," lock on "Confirm" (API already supports `PATCH .../spec`).

**Infra / deploy:**
6. **Public deploy** — finish Netlify CLI deploy of the mock-mode frontend
   (`npx netlify-cli deploy --dir=dist --prod`); for real backend need a tunnel
   (cloudflared) + `wss` + CORS for the deployed origin.
7. **Merge** — order: `feat/luma-scrape-source` stacks on `feat/infra-tracing` -> `main`.

---

## 8. Known issues / bottlenecks

- **Stale-process trap:** if `/health` 404s but `/api/*` works, an OLD uvicorn process is
  serving pre-`/health` code — kill it and relaunch on current code. (Hit this exact
  issue mid-session today; `kill -9` was needed since the old process was blocked in a
  long-running Ollama call and ignored plain `kill`.)
- **Local Ollama is slow** (CPU inference, one request at a time) — a full watch
  backfill can take minutes. The Stop/Resume control and resync poll exist to make
  this tolerable; don't expect the near-instant judging that Claude gave.
- **Global event cursor** (not per-watch): create watches *before* firing a sweep, or
  the new watch may miss already-consumed events (mitigated by `backfill_watch` on
  compile).
- **Public deploy is mock-mode**; real backend needs a tunnel + CORS for the deployed
  origin.
- **No watch-delete endpoint** — junk/duplicate watches from before the double-submit
  fix can't be cleaned up via the API yet, only directly in Redis.

---

## 9. Handoff checklist for the next session

- [ ] `brew services start redis-stack-server` and `brew services start ollama`
      (both may already be running — check `brew services list`).
- [ ] Launch backend + frontend (Section 6); confirm `/health` is green and
      `verify.py` passes.
- [ ] Build the sliding event-thumbnail strip + dynamic overview page (Section 7.1–7.2).
- [ ] Consider a `DELETE /api/watches/{id}` endpoint to clean up junk test watches.
- [ ] Repo: https://github.com/BennPhu/Look-Out (branch `feat/luma-scrape-source`,
      commit `45be717`, working tree clean).
