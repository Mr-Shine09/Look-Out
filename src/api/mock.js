/**
 * Mock backend for the Lookout dashboard.
 *
 * This is the ONLY file that needs to change when the real Redis backend is
 * ready. It implements the exact REST + WebSocket contract from the spec:
 *
 *   REST:  getWatches(), createWatch(), sendFeedback(), getCurve()
 *   WS:    subscribe(handler) -> messages { type: 'candidate' | 'spec_ready'
 *                                                | 'curve_update' | 'pipeline_stage' }
 *
 * See INTEGRATION.md for the line-by-line swap guide.
 */
import { createEventBus } from '../lib/eventBus.js';
import {
  WATCHES,
  CANDIDATE_POOL,
  stubSpecFor,
  LIVE_FIRE_CANDIDATE,
} from './seed.js';

const CANDIDATE_INTERVAL_MS = 3200; // emit a candidate roughly every few seconds
const CURVE_INTERVAL_MS = 12000; // periodic curve update (10-15s)
const SEED_FALSE_ALARM = 0.33; // backend seed value — gives the curve room to fall
const PIPELINE_STAGES = ['scout', 'judge', 'strategist', 'drafter', 'critic'];

let _cidCounter = 1000;
const nextCid = () => `c_${++_cidCounter}`;
const nowIso = () => new Date().toISOString();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createMockApi() {
  const bus = createEventBus();

  // ---- In-memory "Redis" ------------------------------------------------
  const watches = WATCHES.map((w) => ({ ...w, spec: { ...w.spec } }));
  const candidates = new Map(); // cid -> candidate record
  const queues = {}; // watch_id -> array of pool templates left to emit
  for (const w of watches) {
    queues[w.id] = [...(CANDIDATE_POOL[w.id] || [])];
  }

  const curve = []; // [{ timestamp, false_alarm_rate }]
  const session = {
    surfacedAccepted: 0, // # accepted candidates shown to the user
    markedNotRelevant: 0, // # of those the user thumbed down
  };

  let timers = [];
  let running = false;

  // ---- Curve helpers ----------------------------------------------------
  function pushCurvePoint(rate) {
    const point = { timestamp: nowIso(), false_alarm_rate: clamp(rate, 0.02, 0.6) };
    curve.push(point);
    bus.emit({ type: 'curve_update', ...point });
  }

  function currentDecayRate() {
    // Curve trends down over the session with a little noise. Feedback nudges
    // it harder (see sendFeedback) so thumbing feels consequential.
    const elapsedPoints = curve.length;
    const base = SEED_FALSE_ALARM * Math.exp(-elapsedPoints * 0.12);
    const noise = (Math.random() - 0.5) * 0.03;
    return base + noise;
  }

  // ---- Candidate emission ----------------------------------------------
  function emitNextCandidate() {
    // Pick a watch that still has queued candidates.
    const live = watches.filter((w) => (queues[w.id] || []).length > 0);
    if (live.length === 0) return;
    const w = live[Math.floor(Math.random() * live.length)];
    const template = queues[w.id].shift();

    // Semantic duplicates (same event, different source) are SUPPRESSED — the
    // backend collapses these via RediSearch vector KNN. Mark them so the Stay
    // page can count them as "duplicates silenced" instead of surfacing twice.
    const isDuplicate = Boolean(template.dupGroup);
    // ~1 in 6 non-duplicate accepted candidates arrives as a "changed" re-surface,
    // mirroring the backend's HASH-diff dedup (status closed -> open, etc.).
    const isChanged =
      template.judgment === 'accepted' && Math.random() < 0.16 && !isDuplicate;

    const cand = {
      id: nextCid(),
      watch_id: w.id,
      title: template.title,
      source: template.source,
      url: template.url,
      location: template.location,
      starts_at: template.starts_at,
      status: template.status,
      judgment: template.judgment,
      reason: template.reason,
      reasoning: template.reasoning,
      criteria: template.criteria || [],
      state: isDuplicate ? 'duplicate' : isChanged ? 'changed' : 'new',
      label: null,
      timestamp: nowIso(),
    };
    candidates.set(cand.id, cand);

    if (cand.judgment === 'accepted' && cand.state !== 'duplicate') session.surfacedAccepted += 1;

    bus.emit({
      type: 'candidate',
      watch_id: cand.watch_id,
      id: cand.id,
      title: cand.title,
      source: cand.source,
      url: cand.url,
      location: cand.location,
      starts_at: cand.starts_at,
      status: cand.status,
      judgment: cand.judgment,
      reason: cand.reason,
      reasoning: cand.reasoning,
      criteria: cand.criteria,
      state: cand.state,
      timestamp: cand.timestamp,
    });
  }

  // ---- Public API (REST equivalents) -----------------------------------
  async function getWatches() {
    await tick(120);
    return watches.map((w) => ({
      id: w.id,
      query_text: w.query_text,
      spec: { must_match: [...w.spec.must_match], reject_cases: [...w.spec.reject_cases] },
      status: w.status,
    }));
  }

  async function createWatch(queryText, searchSpec) {
    await tick(150); // 202 Accepted
    const id = `w_${Date.now().toString(36)}`;
    // `searchSpec` mirrors the real backend's `search_spec` param; stored for
    // parity/debugging even though the stub spec is derived from query text.
    const watch = {
      id,
      query_text: queryText,
      search_spec: searchSpec || null,
      status: 'compiling',
      spec: { must_match: [], reject_cases: [] },
    };
    watches.push(watch);
    queues[id] = [];

    // Spec compiles asynchronously, then arrives over the WS (spec_ready).
    setTimeout(() => {
      const spec = stubSpecFor(queryText);
      watch.spec = spec;
      watch.status = 'watching';
      bus.emit({
        type: 'spec_ready',
        watch_id: id,
        must_match: spec.must_match,
        reject_cases: spec.reject_cases,
      });
    }, 1500);

    return { accepted: true, watch_id: id };
  }

  async function sendFeedback(candId, label, _watchId) {
    await tick(90);
    const cand = candidates.get(candId);
    if (cand) {
      cand.label = label;
      if (cand.judgment === 'accepted' && label === 'not_relevant') {
        session.markedNotRelevant += 1;
      }
    }
    // Feedback retrains the relevance bar -> recompute false-alarm rate now.
    // Thumbs-down bumps it slightly (a caught miss); thumbs-up accelerates the
    // decay. Either way the curve visibly reacts to the click.
    const nudge = label === 'relevant' ? -0.04 : 0.02;
    const last = curve.length ? curve[curve.length - 1].false_alarm_rate : SEED_FALSE_ALARM;
    pushCurvePoint(last + nudge + (Math.random() - 0.5) * 0.015);
    return { ok: true };
  }

  async function getCurve() {
    await tick(100);
    return curve.map((p) => ({ ...p }));
  }

  let delivery = { channels: ['dashboard'], discord_webhook: '', webhook_url: '', email: '' };
  async function getDelivery() {
    await tick(80);
    return { ...delivery };
  }
  async function saveDelivery(config = {}) {
    await tick(120);
    delivery = {
      channels: Array.isArray(config.channels) ? config.channels : [],
      discord_webhook: config.discord_webhook || '',
      webhook_url: config.webhook_url || '',
      email: config.email || '',
    };
    return { ok: true, config: { ...delivery }, test: config.test ? { ok: true, sent: [] } : undefined };
  }

  let profile = {
    full_name: '', email: '', phone: '', dob: '', school: '', major: '',
    grad_year: '', github: '', portfolio: '', linkedin: '', bio: '',
  };
  async function getProfile() {
    await tick(80);
    return { ...profile };
  }
  async function saveProfile(next = {}) {
    await tick(120);
    profile = { ...profile, ...next };
    return { ok: true, profile: { ...profile } };
  }
  async function applyCandidate(candId, _watchId) {
    await tick(100);
    const cand = candidates.get(candId);
    if (cand) cand.applied = true;
    return { ok: true, applied_at: new Date().toISOString() };
  }

  async function getCandidates(watchId) {
    await tick(100);
    return [...candidates.values()]
      .filter((c) => !watchId || c.watch_id === watchId)
      .map((c) => ({ ...c, criteria: [...(c.criteria || [])] }));
  }

  async function updateSpec(watchId, spec = {}) {
    await tick(120);
    const watch = watches.find((w) => w.id === watchId);
    if (watch) {
      watch.spec = {
        must_match: [...(spec.must_match || [])],
        reject_cases: [...(spec.reject_cases || [])],
      };
      watch.status = 'watching';
      bus.emit({
        type: 'spec_ready',
        watch_id: watchId,
        must_match: watch.spec.must_match,
        reject_cases: watch.spec.reject_cases,
      });
    }
    return { id: watchId, ...(watch || {}) };
  }

  // ---- Pipeline (V3) ----------------------------------------------------
  function triggerPipeline(candId) {
    const cand = candidates.get(candId);
    const snippets = {
      scout: cand ? `Pulled "${cand.title}" from ${cand.source}.` : 'Source read complete.',
      judge: 'Fit confirmed against spec — strong match, no reject cases.',
      strategist: 'High ROI: small field, deadline soon. Angle = lead with shipped demos.',
      drafter: 'Drafted tailored application + 3-line pitch.',
      critic: 'Red-teamed draft: tightened claims, fixed 1 overstatement.',
    };
    let delay = 0;
    PIPELINE_STAGES.forEach((stage) => {
      timers.push(
        setTimeout(() => {
          bus.emit({ type: 'pipeline_stage', stage, status: 'running' });
        }, delay)
      );
      delay += 700;
      timers.push(
        setTimeout(() => {
          bus.emit({
            type: 'pipeline_stage',
            stage,
            status: 'done',
            output_snippet: snippets[stage],
          });
        }, delay)
      );
      delay += 250;
    });
  }

  // ---- Live-fire demo hook ---------------------------------------------
  function injectLiveFire(watchId) {
    const target = watchId || (watches[0] && watches[0].id);
    if (!target) return;
    const t = LIVE_FIRE_CANDIDATE;
    const cand = {
      id: nextCid(),
      watch_id: target,
      ...t,
      criteria: t.criteria || [],
      state: 'new',
      label: null,
      timestamp: nowIso(),
    };
    candidates.set(cand.id, cand);
    session.surfacedAccepted += 1;
    bus.emit({ type: 'candidate', ...cand });
  }

  // ---- Lifecycle --------------------------------------------------------
  function start() {
    if (running) return;
    running = true;
    pushCurvePoint(SEED_FALSE_ALARM); // seed the curve so it has a visible start
    timers.push(setInterval(emitNextCandidate, CANDIDATE_INTERVAL_MS));
    timers.push(setInterval(() => pushCurvePoint(currentDecayRate()), CURVE_INTERVAL_MS));
    // Prime the board quickly so it isn't empty on load.
    timers.push(setTimeout(emitNextCandidate, 600));
    timers.push(setTimeout(emitNextCandidate, 1600));
  }

  function stop() {
    running = false;
    timers.forEach((t) => {
      clearInterval(t);
      clearTimeout(t);
    });
    timers = [];
  }

  return {
    subscribe: bus.subscribe,
    getWatches,
    createWatch,
    sendFeedback,
    getCurve,
    getDelivery,
    saveDelivery,
    getProfile,
    saveProfile,
    applyCandidate,
    getCandidates,
    updateSpec,
    triggerPipeline,
    injectLiveFire,
    start,
    stop,
  };
}

function tick(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
