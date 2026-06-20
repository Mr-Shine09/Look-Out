# Integration — swapping the mock for the real Redis backend

The dashboard talks to exactly one module: `src/api/index.js`. Everything downstream (components,
the WS dispatch in `main.js`) is written against the shapes below, so switching to the real backend
is a single import change plus a thin `real.js` adapter — not a rewrite.

## The seam

`src/api/index.js`:

```js
import { createMockApi } from './mock.js';
// import { createRealApi } from './real.js';

export function createApi() {
  return createMockApi();
  // return createRealApi(import.meta.env.VITE_API_BASE ?? '');
}
```

Create `src/api/real.js` exposing the **same method names** the app already calls, then flip the two
commented lines.

## Methods the app calls

| App call | Real implementation |
|---|---|
| `getWatches()` | `GET /api/watches` → `[{ id, query_text, spec:{must_match[],reject_cases[]}, status }]` |
| `createWatch(queryText)` | `POST /api/watches {query_text}` → `202`; spec arrives later via WS `spec_ready` |
| `sendFeedback(candId, label)` | `POST /api/candidates/{id}/feedback {label}` → `200` |
| `getCurve()` | `GET /api/curve` → `[{ timestamp, false_alarm_rate }]` |
| `subscribe(handler)` | `new WebSocket('/ws/feed')`; call `handler(JSON.parse(ev.data))` per message |
| `triggerPipeline(candId)` | backend kicks the agent pipeline (or POST a trigger endpoint) |
| `injectLiveFire(watchId)` | demo-only; no real equivalent needed |
| `start()` / `stop()` | open / close the WebSocket |

## WebSocket messages (dispatched in `main.js` by `type`)

```jsonc
{ "type": "candidate", "watch_id", "id", "title", "source", "url",
  "judgment": "accepted"|"rejected", "reason", "timestamp",
  // optional-but-used for richer UI (present on the backend cand hash):
  "location", "starts_at", "status", "state": "new"|"changed"|"seen", "reasoning", "criteria": [{ok,text}] }

{ "type": "spec_ready", "watch_id", "must_match": [], "reject_cases": [] }

{ "type": "curve_update", "timestamp", "false_alarm_rate": 0.18 }

{ "type": "pipeline_stage", "stage": "scout"|"judge"|"strategist"|"drafter"|"critic",
  "status": "running"|"done", "output_snippet" }
```

### Notes for the backend author

- **Core contract fields** (`candidate`, `spec_ready`, `curve_update`, `pipeline_stage`) match the
  shared doc exactly. The dashboard also *renders* `location`, `starts_at`, `status`, `state`,
  `reasoning`, and `criteria` when present — these map directly to fields already on the `cand`
  hash. If any are missing, the card degrades gracefully (skips that line).
- **`state: "changed"`** drives a teal "changed" badge — emit it when a HASH-diff re-surfaces an
  item (status closed→open, time/location change).
- **`false_alarm_rate`** is expected in `0..1`; seed around `0.33` so the curve has room to fall.
  Push a `curve_update` both periodically and after each feedback so the chart reacts to thumbs.
- **`criteria`** is optional sugar for the "why" panel: `[{ ok: boolean, text: string }]`. If you
  only have a prose `reasoning` string, send that alone — the panel still works.

If you rename a field, tell the frontend the same hour (per the shared doc) — it's one edit in
`real.js` to remap.
