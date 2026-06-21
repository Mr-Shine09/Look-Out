# Frontend Integration Handoff

## Summary

The dashboard frontend has been integrated with the FastAPI backend contract documented in `INTEGRATION.md` while keeping the mock backend as the default demo-safe mode.

The implementation now supports:

- A real API adapter in `src/api/real.js` that exposes the same methods as the mock API.
- A one-line mock/real toggle in `src/api/index.js`.
- REST calls to the FastAPI backend.
- WebSocket feed handling for live dashboard updates.
- Normalization of backend response fields so frontend components receive stable shapes.
- Live precision-curve updates from feedback and backend `curve_update` messages.
- Pipeline animation from backend `pipeline_stage` messages.
- A live-fire demo hook through `window.lookout.fire()`.
- Graceful candidate card rendering when optional backend fields are missing.
- Local lane reordering after thumbs feedback so the demo visibly reacts.
- Idle lane state that says `watching… nothing new yet` instead of looking broken.

## Contract Fit Check

The implementation was checked against `INTEGRATION.md`.

### Matching items

| Contract item | Implementation status |
|---|---|
| `getWatches()` | Implemented as `GET /api/watches` in `src/api/real.js`. |
| `createWatch(queryText)` | Implemented as `POST /api/watches` with `{ query_text }`. |
| `sendFeedback(candId, label)` | Implemented as `POST /api/candidates/{id}/feedback` with `{ label }`. |
| `getCurve()` | Implemented as `GET /api/curve`. |
| `subscribe(handler)` | Implemented with `new WebSocket(.../ws/feed)` and JSON message dispatch. |
| `triggerPipeline(candId)` | Implemented as `POST /api/candidates/{id}/pipeline`. |
| `injectLiveFire(watchId)` | Implemented as `POST /api/scout/run`; sends `watch_id` when provided. |
| `start()` | Opens/ensures the WebSocket connection. |
| `stop()` | Closes the WebSocket connection. |
| `candidate` WS messages | Normalized and routed to the board. |
| `spec_ready` WS messages | Normalized and routed to the watch creator spec panel. |
| `curve_update` WS messages | Normalized and routed to the precision curve. |
| `pipeline_stage` WS messages | Normalized and routed to the pipeline panel. |
| `state: "changed"` | Still renders a teal `changed` badge in candidate cards. |
| Optional card fields | Missing title/source/reason/timestamp/criteria now degrade safely. |

### One intentional seam difference

`INTEGRATION.md` shows the original comment/uncomment seam. The current implementation uses a cleaner boolean toggle:

- `src/api/index.js`
- `const USE_REAL_BACKEND = false;`

To switch to the real backend, change that one line to:

```js
const USE_REAL_BACKEND = true;
```

The behavior still satisfies the goal: mock and real backends are swapped from one file without changing UI components.

## Files Changed

### `src/api/real.js`

Implemented the real backend adapter.

Key details:

- Defaults to `http://localhost:8000` when no base URL is supplied.
- Reads `import.meta.env.VITE_API_BASE` for backend host configuration.
- Normalizes base URLs by removing trailing slashes.
- Converts HTTP/HTTPS backend URLs into WS/WSS URLs for `/ws/feed`.
- Wraps `fetch` with JSON headers and structured error messages.
- Handles empty/204 responses safely.
- Parses WebSocket messages and normalizes known message types before handing them to the app.
- Supports these public methods:
  - `subscribe`
  - `getWatches`
  - `createWatch`
  - `sendFeedback`
  - `getCurve`
  - `triggerPipeline`
  - `injectLiveFire`
  - `start`
  - `stop`

Normalization handled:

- Watch IDs from `id`, `watch_id`, or `watchId`.
- Query text from `query_text`, `queryText`, or `query`.
- Candidate IDs from `id`, `candidate_id`, or `cid`.
- Candidate watch IDs from `watch_id`, `watchId`, or nested `watch.id`.
- Candidate titles/sources with safe fallbacks.
- `judgment` variants like `accepted`, `match`, `relevant`, and boolean `true`.
- `criteria` as arrays, JSON strings, objects, or simple strings.
- Curve points from `false_alarm_rate`, `falseAlarmRate`, or `rate`.
- Pipeline snippets from `output_snippet`, `outputSnippet`, or `output`.

### `src/api/index.js`

Changed the API seam to import both adapters and choose with one line:

```js
const USE_REAL_BACKEND = false;
```

Current default remains mock-safe. For the real backend demo, set it to `true`.

### `src/components/candidateCard.js`

Hardened candidate cards for backend data variations.

Key details:

- Missing title becomes `Untitled opportunity`.
- Missing source becomes `Unknown source`.
- Missing reason gets a safe match/reject fallback.
- Missing reasoning shows `No detailed reasoning available.` in the why panel.
- Missing or invalid timestamp is skipped instead of rendering a broken date.
- Missing criteria renders safely.
- String criteria are supported.
- Existing feedback label is reflected visually on re-render.
- `state: "changed"` still renders the teal badge.

### `src/components/lane.js`

Added local lane state so card feedback visibly reorders the lane.

Key details:

- Tracks cards in a `Map` by candidate ID.
- Replaces repeated candidate updates instead of duplicating cards.
- Recomputes accepted/rejected counts from stored card state.
- Sorts cards by feedback/demo priority:
  1. Thumbed relevant.
  2. Accepted and not thumbed down.
  3. Thumbed not relevant.
  4. Rejected/other.
- Keeps newest-first ordering within each priority group.
- Keeps the idle `watching… nothing new yet` state.

### `src/components/board.js`

Made WebSocket candidate routing more resilient.

Key details:

- If a candidate arrives for a watch ID that does not have a lane yet, the board creates a fallback lane.
- This prevents real WebSocket timing races from dropping candidates before `getWatches()` has fully populated lanes.

### Other modified frontend files already in the working tree

The working tree also contains layout/style modifications in:

- `src/components/header.js`
- `src/components/precisionCurve.js`
- `src/main.js`
- `src/styles/main.css`
- `src/styles/theme.css`

These were present as part of the demo/frontend polish track and were included in final verification.

## How To Run Mock Demo

Install dependencies if needed:

```powershell
npm install
```

Start the frontend:

```powershell
npm run dev
```

Expected behavior:

- Dashboard loads with mock data.
- Watch creation shows compiling state and later spec details.
- Candidate lanes populate.
- Empty/idle lanes say `watching… nothing new yet`.
- Thumbs feedback visually reorders cards and moves the curve.
- `⚡ act` animates scout, judge, strategist, drafter, and critic stages.
- Browser console command `lookout.fire()` injects a guaranteed match.

## How To Run Real Backend Demo

Start the backend stack first. From `README.md`, the backend expects Redis Stack and the Python service.

Then configure the frontend backend base URL:

```powershell
$env:VITE_API_BASE="http://localhost:8000"
```

Flip the frontend seam:

```js
const USE_REAL_BACKEND = true;
```

Start the frontend:

```powershell
npm run dev
```

Expected real-backend behavior:

- `GET /api/watches` populates watch lanes.
- `POST /api/watches` starts watch compilation.
- `spec_ready` messages populate must-match and reject-if lists.
- `candidate` messages stream cards into lanes.
- `curve_update` messages update the precision curve.
- `pipeline_stage` messages animate the pipeline panel.
- `lookout.fire()` calls the backend live-fire trigger.

## Verification Performed

The following verification passed:

```powershell
npm run build
```

Result:

- Vite production build completed successfully.
- 18 modules transformed.
- No build errors.

The following check also passed:

```powershell
git diff --check
```

Result:

- No whitespace errors reported.
- Git warned that `src/api/real.js` line endings may be normalized from LF to CRLF next time Git touches the file; this is not a code failure.

## Not Yet Verified

The real backend was not end-to-end exercised in this IDE session because a running backend instance was not available during verification.

Partner verification still recommended:

1. Start Redis Stack.
2. Start the FastAPI backend.
3. Set `VITE_API_BASE`.
4. Flip `USE_REAL_BACKEND` to `true`.
5. Run the frontend.
6. Confirm `spec_ready`, `candidate`, `curve_update`, and `pipeline_stage` messages render live.
7. Confirm `lookout.fire()` catches an item on camera.

## Demo Handoff Notes

For a clean 90-second demo:

1. Keep `USE_REAL_BACKEND = false` for a no-backend mock rehearsal.
2. Use thumbs on accepted cards to show immediate card reorder and curve movement.
3. Use `⚡ act` to show the five-stage pipeline.
4. Use `lookout.fire()` from the browser console for the live-fire moment.
5. For the backend demo, flip only `USE_REAL_BACKEND` and set `VITE_API_BASE`.
6. If a backend field changes, update only the normalizer in `src/api/real.js`.

## Partner Ownership / Next Steps

- Backend partner should confirm `/api/scout/run` should ignore or accept the optional `watch_id` body.
- Backend partner should emit `curve_update` immediately after feedback so the chart moves on thumbs.
- Backend partner should emit `state: "changed"` for HASH-diff resurfaced candidates.
- Frontend partner should keep the mock as default until demo day unless the team wants real mode enabled by default.
- If the contract changes, make the compatibility edit in `src/api/real.js` rather than changing UI components.
