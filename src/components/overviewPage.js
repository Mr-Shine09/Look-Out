import { el } from '../lib/dom.js';
import { EventStrip } from './eventStrip.js';
import { tally } from '../lib/classify.js';

/** Tween an integer element toward `to` (cubic ease-out). */
function animateCount(node, to) {
  const from = parseInt(node.textContent, 10) || 0;
  // requestAnimationFrame is throttled in a hidden tab, which would freeze the
  // count mid-tween; when not visible, just land on the final value.
  if (from === to || document.hidden) {
    node.textContent = String(to);
    return;
  }
  const start = performance.now();
  const dur = 480;
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = String(Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/**
 * OVERVIEW — the whole picture at a glance.
 *
 * Aggregates every candidate across every watch (not scoped to one) into the
 * suppression story: how much Lookout surfaced vs. silenced, broken down by
 * reason, plus how many sources and watches are live. Numbers update live —
 * a websocket candidate push or the periodic REST poll moves them without a
 * refresh. Buckets come from the shared classifier, so they match Stay exactly.
 */
export function OverviewPage({ api }) {
  const records = new Map(); // cid -> candidate (across all watches)
  let watchCount = 0;
  let activeWatchCount = 0;
  let pollTimer = null;
  let active = false;

  const strip = EventStrip({ api, label: 'Live from the sources Lookout watches' });

  // ---- Headline ratio (surfaced vs silenced) -----------------------------
  const surfacedBig = el('span', { class: 'ratio-num ratio-num--surfaced', text: '0' });
  const silencedBig = el('span', { class: 'ratio-num ratio-num--silenced', text: '0' });
  const barSurfaced = el('span', { class: 'ratio-seg ratio-seg--surfaced' });
  const barSilenced = el('span', { class: 'ratio-seg ratio-seg--silenced' });
  const ratioBar = el('div', { class: 'ratio-bar' }, [barSurfaced, barSilenced]);
  const ratioSub = el('p', { class: 'ratio-sub', text: 'Nothing scanned yet.' });

  // ---- Stat tiles --------------------------------------------------------
  const dupNum = el('span', { class: 'stat-num', text: '0' });
  const offNum = el('span', { class: 'stat-num', text: '0' });
  const expiredNum = el('span', { class: 'stat-num', text: '0' });
  const seenNum = el('span', { class: 'stat-num', text: '0' });
  const watchesNum = el('span', { class: 'stat-num', text: '0' });
  const sourcesNum = el('span', { class: 'stat-num', text: '0' });

  function sourcesSeen() {
    const set = new Set();
    for (const c of records.values()) if (c.source) set.add(c.source);
    return set.size;
  }

  function render() {
    const { surfaced, dup, off, expired, silenced, seen } = tally(records.values());
    animateCount(surfacedBig, surfaced);
    animateCount(silencedBig, silenced);
    animateCount(dupNum, dup);
    animateCount(offNum, off);
    animateCount(expiredNum, expired);
    animateCount(seenNum, seen);
    animateCount(watchesNum, activeWatchCount);
    animateCount(sourcesNum, sourcesSeen());

    const total = surfaced + silenced;
    barSurfaced.style.flex = String(surfaced);
    barSilenced.style.flex = String(silenced);
    ratioBar.classList.toggle('ratio-bar--empty', total === 0);

    if (!seen) {
      ratioSub.textContent = 'Nothing scanned yet — create a watch to see the suppression start.';
    } else {
      const sPct = total ? Math.round((surfaced / total) * 100) : 0;
      ratioSub.textContent = `Across ${watchCount} watch${watchCount === 1 ? '' : 'es'}, Lookout scanned ${seen} update${
        seen === 1 ? '' : 's'
      } and surfaced only ${surfaced === 0 ? 'zero' : `${sPct}%`} — the rest stayed silent.`;
    }
  }

  // The backend reuses one event `id` across every watch that judged it, so
  // the same event appears as many rows (one judgment per watch). Key the
  // aggregate by watch_id + id so "total scanned" matches GET /api/candidates
  // exactly instead of collapsing cross-watch judgments into one.
  const keyOf = (cand) => `${cand.watch_id || ''}::${cand.id}`;

  function ingest(cand) {
    if (!cand || !cand.id) return false;
    const key = keyOf(cand);
    const had = records.has(key);
    records.set(key, cand);
    return !had;
  }

  async function refresh() {
    try {
      const [cands, watches] = await Promise.all([
        api.getCandidates?.(),
        api.getWatches?.(),
      ]);
      for (const c of cands || []) ingest(c);
      if (Array.isArray(watches)) {
        watchCount = watches.length;
        activeWatchCount = watches.filter((w) => (w.status || 'watching') !== 'stopped').length;
      }
      render();
    } catch (err) {
      console.warn('[overview] refresh failed', err);
    }
  }

  // Live push from the shared feed dispatch (see main.js).
  function handleCandidate(msg) {
    if (!active) {
      // Still keep the aggregate warm so the page is instant when opened.
      ingest(msg);
      return;
    }
    if (ingest(msg)) render();
    else render();
  }

  function show() {
    active = true;
    render(); // paint whatever we already have immediately
    refresh();
    if (!pollTimer) pollTimer = setInterval(refresh, 5000);
  }

  function hide() {
    active = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  const node = el('section', { class: 'page page-overview', hidden: true }, [
    el('div', { class: 'overview-head' }, [
      el('p', { class: 'eyebrow', text: 'Overview' }),
      el('h1', { class: 'overview-title head', text: 'Everything Lookout is holding back.' }),
      el('p', {
        class: 'overview-sub',
        text: 'One live picture of the whole suppression engine — what surfaced, what was silenced, and why — across every watch you have running.',
      }),
    ]),
    strip.node,
    el('div', { class: 'ratio-card' }, [
      el('div', { class: 'ratio-head' }, [
        el('div', { class: 'ratio-stat' }, [surfacedBig, el('span', { class: 'ratio-cap', text: 'surfaced to you' })]),
        el('span', { class: 'ratio-dot', text: '·' }),
        el('div', { class: 'ratio-stat' }, [silencedBig, el('span', { class: 'ratio-cap', text: 'silenced for you' })]),
      ]),
      ratioBar,
      ratioSub,
    ]),
    el('div', { class: 'overview-stats' }, [
      el('div', { class: 'stat stat--dup' }, [dupNum, el('span', { class: 'stat-label', text: 'duplicates silenced' })]),
      el('div', { class: 'stat stat--off' }, [offNum, el('span', { class: 'stat-label', text: 'off-topic filtered' })]),
      el('div', { class: 'stat stat--expired' }, [expiredNum, el('span', { class: 'stat-label', text: 'already passed' })]),
      el('div', { class: 'stat stat--seen' }, [seenNum, el('span', { class: 'stat-label', text: 'total scanned' })]),
      el('div', { class: 'stat stat--watches' }, [watchesNum, el('span', { class: 'stat-label', text: 'active watches' })]),
      el('div', { class: 'stat stat--sources' }, [sourcesNum, el('span', { class: 'stat-label', text: 'sources seen' })]),
    ]),
  ]);

  return { node, key: 'overview', show, hide, handleCandidate };
}
