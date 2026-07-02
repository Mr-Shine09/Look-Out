import { el, clear } from '../lib/dom.js';
import { CandidateCard } from './candidateCard.js';
import { Pipeline } from './pipeline.js';
import { autoApply } from '../lib/autoApply.js';
import { PrecisionCurve } from './precisionCurve.js';
import { classify, tally } from '../lib/classify.js';

/** Tween a number element from its current value to `to` (cubic ease-out). */
function animateCount(node, to) {
  const from = parseInt(node.textContent, 10) || 0;
  if (from === to) {
    node.textContent = String(to);
    return;
  }
  const dur = 480;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * STAY — one purpose: show that Lookout is watching, and staying quiet.
 *
 * This is the suppression engine made visible. For the active topic we show:
 *   - how many updates were SEEN,
 *   - how many were SUPPRESSED (semantic duplicates + off-topic),
 *   - the few that SURVIVED and were surfaced to you.
 * A "show what it silenced" toggle reveals the suppressed items so the
 * mechanism is provable live.
 */
export function StayPage({ api, onReport, onNewSearch, onDeleted }) {
  const pipeline = Pipeline();
  pipeline.node.hidden = true; // on-demand: only appears once the user hits "act"
  const curve = PrecisionCurve();
  curve.node.classList.add('reveal'); // wash-in on scroll
  let scope = { watchId: null, title: 'your watch' };
  const records = new Map(); // cid -> candidate
  let lastCheckedAt = Date.now();
  let watchStatus = 'watching';

  const handlers = {
    onFeedback: (candId, label, watchId) => api.sendFeedback(candId, label, watchId || scope.watchId),
    onAct: (candId) => {
      pipeline.reset();
      pipeline.node.hidden = false;
      api.triggerPipeline(candId);
      pipeline.node.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    },
    onApply: (cand) =>
      autoApply(cand, api, {
        onApplied: () => {
          const rec = records.get(cand.id);
          if (rec) rec.applied = true;
        },
      }),
  };

  // ---- Header / topic ----------------------------------------------------
  const topicEl = el('span', { class: 'stay-topic', text: scope.title });

  // ---- Liveness strip ----------------------------------------------------
  const liveDot = el('span', { class: 'live-dot' });
  const liveCheckedEl = el('span', { class: 'live-checked', text: 'just now' });
  const liveSourcesEl = el('span', { class: 'live-sources', text: 'Luma · Devpost · MLH · Eventbrite' });

  function sourcesSeen() {
    const set = new Set();
    for (const c of records.values()) if (c.source) set.add(c.source);
    return set.size ? [...set].join(' · ') : 'Luma · Devpost · MLH · Eventbrite';
  }
  function refreshLiveness() {
    const secs = Math.max(0, Math.round((Date.now() - lastCheckedAt) / 1000));
    liveCheckedEl.textContent = secs < 2 ? 'just now' : `${secs}s ago`;
    liveSourcesEl.textContent = sourcesSeen();
  }
  setInterval(refreshLiveness, 1000);

  // Safety-net resync: a local Ollama backfill can take minutes (vs. seconds
  // for a hosted API), so a candidate can finish server-side and broadcast
  // over the websocket before the page has settled on the right watchId
  // (e.g. right after createWatch resolves). Poll the REST list periodically
  // so results always land even if a live broadcast was missed or dropped.
  async function resync() {
    if (!scope.watchId) return;
    try {
      const existing = await api.getCandidates?.(scope.watchId);
      let changed = false;
      for (const cand of existing || []) {
        if (!records.has(cand.id)) changed = true;
        ingest(cand);
      }
      if (changed) render();
    } catch (err) {
      console.warn('[stay] resync failed', err);
    }
  }
  setInterval(resync, 5000);

  // ---- Headline ratio ----------------------------------------------------
  const surfacedBig = el('span', { class: 'ratio-num ratio-num--surfaced', text: '0' });
  const silencedBig = el('span', { class: 'ratio-num ratio-num--silenced', text: '0' });
  const barSurfaced = el('span', { class: 'ratio-seg ratio-seg--surfaced' });
  const barSilenced = el('span', { class: 'ratio-seg ratio-seg--silenced' });
  const ratioBar = el('div', { class: 'ratio-bar' }, [barSurfaced, barSilenced]);
  const ratioSub = el('p', { class: 'ratio-sub', text: 'Watching quietly — nothing seen yet.' });

  // ---- Secondary stat tiles ----------------------------------------------
  const dupNum = el('span', { class: 'stat-num', text: '0' });
  const offNum = el('span', { class: 'stat-num', text: '0' });
  const expiredNum = el('span', { class: 'stat-num', text: '0' });
  const seenNum = el('span', { class: 'stat-num', text: '0' });

  let showSilenced = false;
  const silenceToggle = el('button', { class: 'ghost-btn', type: 'button' }, ['Show what it silenced']);
  silenceToggle.addEventListener('click', () => {
    showSilenced = !showSilenced;
    silenceToggle.textContent = showSilenced ? 'Hide silenced' : 'Show what it silenced';
    render();
  });

  // ---- Stop / resume the active watch ------------------------------------
  const stopToggle = el('button', { class: 'ghost-btn', type: 'button' }, ['Stop watching']);
  function setWatchStatusUI(status) {
    // "compiling" is a normal transitional state (spec not compiled yet), not
    // a paused one — only the explicit "stopped" status should read as paused.
    watchStatus = status;
    const stopped = status === 'stopped';
    stopToggle.textContent = stopped ? 'Resume watching' : 'Stop watching';
    liveDot.classList.toggle('live-dot--paused', stopped);
    liveCheckedEl.textContent = stopped ? 'stopped' : liveCheckedEl.textContent;
  }
  stopToggle.addEventListener('click', async () => {
    if (!scope.watchId) return;
    const next = watchStatus === 'stopped' ? 'watching' : 'stopped';
    stopToggle.disabled = true;
    try {
      await api.setWatchStatus?.(scope.watchId, next);
      setWatchStatusUI(next);
    } catch (err) {
      console.warn('[stay] setWatchStatus failed', err);
    } finally {
      stopToggle.disabled = false;
    }
  });

  const newSearchBtn = el(
    'button',
    { class: 'ghost-btn', type: 'button', onClick: () => onNewSearch?.() },
    ['New search']
  );

  // ---- Delete the active watch (two-step confirm, never one-click) --------
  let deleteArmed = false;
  let deleteTimer = null;
  const deleteBtn = el('button', { class: 'ghost-btn ghost-btn--danger', type: 'button' }, ['Delete watch']);
  function disarmDelete() {
    deleteArmed = false;
    deleteBtn.textContent = 'Delete watch';
    deleteBtn.classList.remove('ghost-btn--armed');
    if (deleteTimer) {
      clearTimeout(deleteTimer);
      deleteTimer = null;
    }
  }
  deleteBtn.addEventListener('click', async () => {
    if (!scope.watchId) return;
    if (!deleteArmed) {
      // First click arms; it self-disarms after a few seconds so a stray click
      // can never delete on its own.
      deleteArmed = true;
      deleteBtn.textContent = 'Confirm delete';
      deleteBtn.classList.add('ghost-btn--armed');
      deleteTimer = setTimeout(disarmDelete, 4000);
      return;
    }
    disarmDelete();
    deleteBtn.disabled = true;
    try {
      await api.deleteWatch?.(scope.watchId);
      onDeleted?.(scope.watchId);
    } catch (err) {
      console.warn('[stay] deleteWatch failed', err);
      deleteBtn.disabled = false;
    }
  });

  const feed = el('div', { class: 'stay-feed' });

  function updateStats() {
    const { surfaced, dup, off, expired, silenced, seen } = tally(records.values());
    animateCount(surfacedBig, surfaced);
    animateCount(silencedBig, silenced);
    animateCount(dupNum, dup);
    animateCount(offNum, off);
    animateCount(expiredNum, expired);
    animateCount(seenNum, seen);

    const total = surfaced + silenced;
    const sPct = total ? Math.round((surfaced / total) * 100) : 0;
    barSurfaced.style.flex = String(surfaced);
    barSilenced.style.flex = String(silenced);
    ratioBar.classList.toggle('ratio-bar--empty', total === 0);

    if (!seen) {
      ratioSub.textContent = 'Watching quietly — nothing seen yet.';
    } else {
      ratioSub.textContent = `Out of ${seen} update${seen === 1 ? '' : 's'} seen, Lookout interrupted you ${
        surfaced === 0 ? 'zero times' : `${sPct}% of the time`
      } — the rest stayed silent.`;
    }
  }

  // ---- Section renderer --------------------------------------------------
  function appendSection(items, { label, variant, silenced }) {
    if (!items.length) return;
    feed.append(el('p', { class: `feed-section-label feed-section-label--${variant}`, text: `${label} (${items.length})` }));
    items
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
      .forEach((c) => {
        const card = CandidateCard(c, handlers);
        if (silenced) card.classList.add('card--silenced', `card--${variant}`);
        feed.append(card);
      });
  }

  function render() {
    updateStats();
    clear(feed);
    const all = [...records.values()];
    const surfaced = all.filter((c) => classify(c) === 'surfaced');
    const duplicates = all.filter((c) => classify(c) === 'duplicate');
    const offtopic = all.filter((c) => classify(c) === 'offtopic');
    const expired = all.filter((c) => classify(c) === 'expired');

    if (!all.length) {
      feed.append(
        el('div', { class: 'stay-empty' }, [
          el('span', { class: 'radar' }),
          el('span', { text: 'Watching… nothing worth interrupting you yet.' }),
        ])
      );
      return;
    }

    if (surfaced.length) {
      appendSection(surfaced, { label: 'Surfaced — worth your attention', variant: 'surfaced' });
    } else {
      feed.append(
        el('div', { class: 'stay-empty' }, [
          el('span', { class: 'radar' }),
          el('span', { text: 'Nothing surfaced yet — Lookout is staying quiet.' }),
        ])
      );
    }

    if (showSilenced) {
      appendSection(duplicates, { label: 'Silenced — semantic duplicates', variant: 'dup', silenced: true });
      appendSection(offtopic, { label: 'Silenced — off-topic', variant: 'off', silenced: true });
      appendSection(expired, { label: 'Silenced — event has already passed', variant: 'expired', silenced: true });
    }
  }

  // ---- Public hooks ------------------------------------------------------
  function ingest(cand) {
    if (scope.watchId && cand.watch_id && cand.watch_id !== scope.watchId) return;
    records.set(cand.id, cand);
    lastCheckedAt = Date.now();
  }

  async function loadCurve() {
    try {
      const pts = await api.getCurve?.();
      if (Array.isArray(pts)) curve.setPoints(pts);
    } catch (err) {
      console.warn('[stay] curve load failed', err);
    }
  }

  async function show(next = {}) {
    scope = { watchId: next.watchId || null, title: next.title || next.query || 'your watch' };
    topicEl.textContent = scope.title;
    records.clear();
    pipeline.reset();
    pipeline.node.hidden = true;
    lastCheckedAt = Date.now();
    setWatchStatusUI('watching');
    // The delete button is disabled during an in-flight delete and the instance
    // is reused across watches — re-arm it fresh for whatever we're now showing.
    deleteBtn.disabled = false;
    disarmDelete();
    refreshLiveness();
    render();
    try {
      const existing = await api.getCandidates?.(scope.watchId);
      for (const cand of existing || []) ingest(cand);
    } catch (err) {
      console.warn('[stay] load failed', err);
    }
    if (scope.watchId) {
      try {
        const watches = await api.getWatches?.();
        const match = watches?.find((w) => w.id === scope.watchId);
        if (match?.status) setWatchStatusUI(match.status);
      } catch (err) {
        console.warn('[stay] watch status load failed', err);
      }
    }
    render();
    loadCurve();
  }

  function handleCandidate(msg) {
    ingest(msg);
    render();
  }

  function handlePipeline(msg) {
    pipeline.update(msg);
  }

  function handleCurve(msg) {
    curve.addPoint({ timestamp: msg.timestamp, false_alarm_rate: msg.false_alarm_rate });
  }

  const node = el('section', { class: 'page page-stay', hidden: true }, [
    el('div', { class: 'stay-head' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Stay' }),
        el('h1', { class: 'stay-title head' }, ['Lookout is watching ', topicEl, ' — and staying quiet.']),
      ]),
      el('div', { class: 'stay-head-actions' }, [
        newSearchBtn,
        stopToggle,
        silenceToggle,
        deleteBtn,
        el('button', { class: 'primary-btn', type: 'button', onClick: () => onReport?.(scope) }, ['Get these delivered →']),
      ]),
    ]),
    el('div', { class: 'live-strip' }, [
      liveDot,
      el('span', { class: 'live-label', text: 'Live · last checked ' }),
      liveCheckedEl,
      el('span', { class: 'live-sep', text: ' · scanning ' }),
      liveSourcesEl,
    ]),
    el('div', { class: 'ratio-card' }, [
      el('div', { class: 'ratio-head' }, [
        el('div', { class: 'ratio-stat' }, [surfacedBig, el('span', { class: 'ratio-cap', text: 'surfaced to you' })]),
        el('span', { class: 'ratio-dot', text: '·' }),
        el('div', { class: 'ratio-stat' }, [silencedBig, el('span', { class: 'ratio-cap', text: 'silenced for you' })]),
      ]),
      ratioBar,
      ratioSub,
    ]),
    el('div', { class: 'stay-stats' }, [
      el('div', { class: 'stat stat--dup' }, [dupNum, el('span', { class: 'stat-label', text: 'duplicates silenced' })]),
      el('div', { class: 'stat stat--off' }, [offNum, el('span', { class: 'stat-label', text: 'off-topic filtered' })]),
      el('div', { class: 'stat stat--expired' }, [expiredNum, el('span', { class: 'stat-label', text: 'already passed' })]),
      el('div', { class: 'stat stat--seen' }, [seenNum, el('span', { class: 'stat-label', text: 'total updates seen' })]),
    ]),
    feed,
    curve.node,
    pipeline.node,
  ]);

  return { node, key: 'stay', onShow: () => {}, show, handleCandidate, handlePipeline, handleCurve };
}
