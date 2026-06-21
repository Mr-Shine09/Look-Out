# Standing Orders (refer to this EVERY turn)

> Verbatim instruction from Oak (2026-06-21):
> "Base on this overall view of the project and its goal to have a final product. Spin subDevin to
> replace Oak, Bruce and Harrison to finish the project right now. Remember to target your bugs what
> went wrong, record that and fix it automatically without me having to prompt you again. Use subagent
> Devin to parallel this process. Let me know your blocker from my end so i can help fix it. GO NOW!
> Remember after any significant changes like new features, always git push and commit it to github
> for tracking and source control. Keep these words into a file where you can refer back to my
> instruction for every single turn."

## Operating rules (apply on every turn)
1. **Own all three tracks** — Infra (Oak), Backend (Bruce), Frontend (Harrison). Drive to a final, demo-ready product.
2. **Work autonomously** — do not stop to ask permission for non-destructive work. Keep going until the product is done.
3. **Target bugs, record them, fix automatically** — every bug goes in the Bug Log below (symptom → root cause → fix → commit), then gets fixed without re-prompting.
4. **Commit + push after every significant change** (new feature / bug fix). Small, descriptive commits.
5. **Protect quota** — Browserbase 60-min/mo, Claude credits. Use caches + cheap models. Never burn quota casually.
6. **Surface blockers** — anything needing Oak (interactive login, repo admin, paid upgrades) goes in the Blockers section immediately.
7. **Be honest** — no overclaiming. "subagent Devin" in this env = Cascade drives all tracks itself, using the code-search subagent for fast context.

## Blockers (need Oak) — keep updated
- [ ] **Public deploy**: Netlify CLI needs interactive login in Oak's real terminal (`npx netlify-cli login` then deploy). Cannot be automated here.
- [ ] **Merge to `main`**: repo is BennPhu/Look-Out; Oak has push, not admin. Confirm target branch + that Bruce/Harrison are clear before merging. PR: https://github.com/BennPhu/Look-Out/pull/new/feat/luma-scrape-source
- [ ] **Redis Cloud Search module**: sponsor/shared demo DB lacks RediSearch (`FT.CREATE` fails). Local Redis Stack is the workaround. Enable Search & Query on the Cloud DB for a non-laptop demo.
- [ ] **.env `REDIS_URL`** points at Redis Cloud (times out on venue WiFi). Demo uses local `redis://localhost:6379`.

## Running now (local demo)
- Backend: `:8000` (real Luma scrape, Browserbase on, local Redis, Phoenix+Sentry active).
- Frontend (real backend): `:5173` — started with `VITE_USE_REAL_BACKEND=true VITE_API_BASE=http://127.0.0.1:8000`.
- Relaunch backend: `set -a; . ./.env; set +a; REDIS_URL=redis://localhost:6379 LOOKOUT_EVENT_SOURCE=scrape LOOKOUT_USE_BROWSERBASE=1 LOOKOUT_POLL_SECONDS=3600 LOOKOUT_EVENT_BATCH_SIZE=8 ./venv-backend/bin/uvicorn lookout.app:app --host 127.0.0.1 --port 8000`
- Relaunch frontend: `VITE_USE_REAL_BACKEND=true VITE_API_BASE=http://127.0.0.1:8000 node_modules/.bin/vite --host 127.0.0.1 --port 5173 --strictPort`
- Note: the PATCH test rewrote watch `w_1637c2abd2` spec to in-person/SF + reject online-only (sane demo values; recompile or PATCH to change).

## Commits this session
- `135ad19` infra: permanent CORS regex + verify.py restore (+Sentry check, Browserbase gated)
- `263df0f` core: BUG-1 watch-aware curve/feedback, BUG-2 candidate backfill, BUG-3 new-watch backfill, grounded pipeline
- `a4a95de` feat: human-in-the-loop spec editing (PATCH + adapters)

## Bug Log (symptom → root cause → fix → commit)

- **BUG-1 — Curve doesn't fall cleanly.** Symptom: marking a 2nd event relevant showed 0.33 again
  (noisy curve). Root cause: `get_curve()` merged points across ALL watches, and `find_candidate()`
  returned the first `cand:*:{cid}` match — so feedback landed on the *rejected* copy under a different
  watch and recomputed the wrong watch's rate. Fix: `get_curve(watch_id)` returns a single watch's
  series (defaults to the most-accepted "primary" watch); `feedback`/`find_candidate` are watch-aware
  (prefer the accepted copy, accept explicit `watch_id`).
- **BUG-2 — Candidates vanish on page refresh.** Symptom: refresh empties the board. Root cause:
  candidates arrived only over WebSocket; no REST backfill. Fix: `GET /api/candidates` +
  `engine.list_candidates()` + frontend hydrates on init.
- **BUG-3 — New watch sees nothing (global cursor).** Symptom: a watch created after events were
  consumed stays empty. Root cause: the event source has a single global cursor. Fix:
  `source.snapshot()` + `engine.backfill_watch()` run on watch compile so a new watch evaluates the
  known event pool immediately (capped to bound Claude cost).
- **IMPROVE — Act pipeline was generic.** strategist/drafter/critic emitted static strings. Fix:
  snippets now use the real candidate's title/location/source/spec so the pipeline reads as grounded.
