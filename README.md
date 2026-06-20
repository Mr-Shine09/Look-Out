# Lookout — Dashboard (Frontend Track)

A tireless watcher for live opportunities. Lookout monitors the web for things you describe in
plain English and, when something genuinely matches, runs an agent pipeline to act on it for your
approval. This repo is the **frontend dashboard**, built fully decoupled from the backend against a
mock data layer that mirrors the real Redis engine's contract.

> Demoed in the **events / hackathons** domain (a swappable placeholder noun).

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. No API keys, no backend, no Docker — everything runs on the mock.

```bash
npm run build      # production build into dist/
npm run preview    # preview the build
```

## What's in the box

| Feature | File | Notes |
|---|---|---|
| **Watch creation + spec compile** | `src/components/watchCreator.js` | Plain-English input → "compiling…" → must-match / reject-if lists |
| **Multi-lane live board** | `src/components/board.js`, `lane.js` | One lane per watch; accepted (amber) vs rejected (grey); honest "watching… nothing new yet" idle state; `changed` badge |
| **Feedback + reasoning** | `src/components/candidateCard.js` | Optimistic thumbs up/down; click-to-expand "why this fired" with criteria breakdown |
| **Precision curve** | `src/components/precisionCurve.js` | Hand-rolled SVG; false-alarm rate falling over the session; reacts to feedback |
| **Action pipeline** | `src/components/pipeline.js` | Scout → Judge → Strategist → Drafter → Critic, lights up on "act" |

## Design system

Dark, terminal-adjacent. CSS variables in `src/styles/theme.css`:

- Background `#0B1016` (void) · Teal `#34D9C8` (watching/active) · Amber `#F5A524` (real match) ·
  Grey `#56657A` (rejected)
- Fonts: JetBrains Mono (data/labels), Bricolage Grotesque (headers), system sans (body)

## Architecture — the mock/real seam

All data flows through **one swap point**: `src/api/index.js`. Today it returns the mock
(`src/api/mock.js`), which implements the exact REST + WebSocket contract the real Redis backend
will expose. Swapping to the real backend is a one-line change — see `INTEGRATION.md`.

```
src/
  api/
    index.js        # ← the seam: mock today, real later
    mock.js         # mock REST + WS feed (the only file to replace)
    seed.js         # realistic event/hackathon fixtures
  components/        # header, watchCreator, board, lane, candidateCard, precisionCurve, pipeline
  lib/               # dom helpers + event bus (mock WebSocket)
  styles/            # theme.css (design system) + main.css (layout/components)
  main.js            # bootstraps + dispatches the WS feed by message.type
```

## Demo hooks

- **Live-fire on cue:** in the browser console, run `lookout.fire()` to inject a guaranteed match
  into the first lane (mirrors the backend's "append to events.json" trick).
- **Act on a match:** click `⚡ act` on any accepted card to run the five-stage pipeline.
- **Move the curve:** thumb candidates up/down — the precision curve reacts immediately.

## Redis backend

A FastAPI + Redis Stack backend now lives in `lookout/`. It implements the real REST + WebSocket
contract from `INTEGRATION.md`, including RediSearch vector dedup, a seed Scout, Claude/stub
spec compile and judging, feedback learning, and the false-alarm curve.

```bash
# Redis Stack with RediSearch vectors
# If Docker is available:
docker run -d --name lookout-redis -p 6379:6379 redis/redis-stack:latest

# Python backend
py -3 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set REDIS_URL=redis://localhost:6379
py -3 -m lookout
```

Backend endpoints:

- `GET /health`
- `GET /api/watches`
- `POST /api/watches {"query_text":"..."}`
- `POST /api/candidates/{id}/feedback {"label":"relevant"|"not_relevant"}`
- `GET /api/curve`
- `WS /ws/feed`

Dedup smoke test, after Redis and dependencies are running:

```bash
py -3 scripts/test_dedup.py
```

To point the dashboard at the real backend, import `createRealApi` in `src/api/index.js` and return
`createRealApi(import.meta.env.VITE_API_BASE ?? 'http://localhost:8000')`.

## Status

The frontend mock remains the default. The Redis backend implementation is present and syntax-checked;
full Redis integration requires Redis Stack and Python dependencies installed locally.
