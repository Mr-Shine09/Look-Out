# Lookout — Infra & Observability Track (Oak)

> Your mission: make the plumbing bulletproof and the "it learns / it's reliable" story
> **visible**. You own Docker + Phoenix, Arize tracing, Sentry, the verify gate, and merge
> coordination across the frontend (Harrison) and backend (Bruce) tracks.

---

## 1. Context (you wrote the spec — this is the operational view)

Lookout = watch → judge → act. The three differentiators that must show in the demo are the
**learned relevance model**, the **critic loop**, and **real tool use**. Your track makes two of
the proof beats real: the **falling precision curve in Phoenix** and the **reliability story**
(Sentry + a clean verify gate).

Sponsor angles you serve: **Arize/Phoenix** (the learning curve runs in Phoenix regardless — it's
OSS), **Sentry** (backend errors, "reliability from day one"), and orchestration upside (Agentspan).

---

## 2. Your tasks

### A. Docker + Phoenix (do first)
```bash
docker run -d -p 6006:6006 --name phoenix arizephoenix/phoenix:latest
python verify.py        # Phoenix check should now go green
```
Phoenix at http://localhost:6006. This is the last red light in the gate.

### B. Arize / Phoenix tracing
- Instrument the Claude / agent calls in Bruce's `lookout/` pipeline with OpenInference/Phoenix
  tracing so each scout/judge/strategist/drafter/critic span shows up.
- Surface the **precision / false-alarm curve** in Phoenix as the live-training proof
  (mirrors the frontend curve; data could not exist before the event → satisfies the hackathon
  "train on data collected during the event" rule).

### C. Sentry
- Wire Sentry into the FastAPI backend for error monitoring. Scope it to **backend errors only**
  so it doesn't overlap Phoenix (curve) or Agentspan (agent runtime) in the 90s demo.

### D. Verify gate ownership
- `verify.py` already checks Claude / Redis / Browserbase / Phoenix. Keep it current; add a
  Sentry (and optional Arize) check if it helps the team confirm a green machine in <1 min.
- Make sure teammates can run it: it needs `anthropic redis browserbase httpx python-dotenv`.

### E. Merge coordination
- Shepherd `backend-redis-track` (Bruce) and `feat/frontend-integration` (Harrison) into `main`.
- Own the shared `.env` **contract** (variable names) and distribute real values privately
  (see `CREDENTIALS.local.md`, git-ignored).
- Resolve any contract drift between `real.js` and the backend's WS/REST shapes vs `INTEGRATION.md`.

### F. (Stretch) Agentspan / Orkes
- Only after V2 is polished: wrap the pipeline for durable steps, auto-retries, and a
  human-approval gate. Prize upside, not core scope.

---

## 3. Credentials you hold (distribute privately)

You are the keeper of the real values. They live in two **git-ignored** files at the repo root:

- `.env` — your working copy (already in place; used by `verify.py` and the backend).
- `CREDENTIALS.local.md` — the shareable copy to hand Bruce/Harrison privately.

Variable names: `ANTHROPIC_API_KEY`, `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID`, `REDIS_URL`, `PHOENIX_URL` (`http://localhost:6006`). **Never commit the values.**

- **Claude** — $25 starter credit, active.
- **Redis Cloud** — host `loam-megasnug-month-36159.db.redis.io:19873` (new DB; old one died on venue WiFi).
- **Browserbase** — free tier, 60 min/month — guard it (Bruce's scout sessions burn the quota).

> **Hackathon-day reminder:** venue WiFi silently blocked long-lived sockets (Redis timeouts).
> A personal mobile hotspot fixed it instantly. **Bring a backup hotspot.**

---

## 4. Definition of done

- `python verify.py` → all green on every teammate's machine.
- Phoenix shows live agent traces + the falling false-alarm curve.
- Sentry catching backend errors.
- `backend-redis-track` + `feat/frontend-integration` merged to `main`; demo rehearsed end-to-end.

---

## 5. Expected output after your session (so we're all on the same page)

**Phoenix + gate**
- `docker ps` shows the `phoenix` container running; `http://localhost:6006` loads the Phoenix UI.
- `python verify.py` → all four green on your machine (and you've confirmed teammates can too).

**Tracing**
- Running a watch end-to-end produces **spans in Phoenix** for each agent call
  (scout/judge/strategist/drafter/critic), with latency + token usage visible.
- The **precision / false-alarm curve** is viewable in Phoenix and falls as feedback accrues —
  this is the live-training proof beat.

**Sentry**
- A deliberately thrown backend error appears in the Sentry dashboard (proves wiring), scoped to
  backend errors only.

**Integration / merge**
- `backend-redis-track` and `feat/frontend-integration` are merged into `main` with the contract
  intact; cloning `main` fresh + setting `.env` + `npm run dev` + starting the backend reproduces
  the full demo.
- The complete 90-second arc runs end-to-end on the merged `main`, rehearsed at least once.
