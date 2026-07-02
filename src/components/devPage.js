import { el } from '../lib/dom.js';
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
 * DEV — the hidden developer window (#/dev, enabled via a local flag).
 *
 * Home of the engine metrics that used to masquerade as the product's front
 * page: the surfaced-vs-silenced ratio and the aggregate suppression stats
 * across every watch. Normal users never see this; the nav link only exists
 * once localStorage.lookoutDev is set (see main.js).
 */
export function DevPage({ api }) {
  const records = new Map(); // watch_id::id -> candidate (across all watches)
  let watchCount = 0;
  let activeWatchCount = 0;
  let pollTimer = null;
  let active = false;

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

  const keyOf = (cand) => `${cand.watch_id || ''}::${cand.id}`;

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
      ratioSub.textContent = 'Nothing scanned yet.';
    } else {
      const sPct = total ? Math.round((surfaced / total) * 100) : 0;
      const pctLabel = surfaced === 0 ? 'zero' : sPct === 0 ? '<1%' : `${sPct}%`;
      ratioSub.textContent = `Across ${watchCount} watch${watchCount === 1 ? '' : 'es'}, Lookout scanned ${seen} update${
        seen === 1 ? '' : 's'
      } and surfaced only ${pctLabel} — the rest stayed silent.`;
    }
  }

  function ingest(cand) {
    if (!cand || !cand.id) return;
    records.set(keyOf(cand), cand);
  }

  async function refresh() {
    try {
      const [cands, watches] = await Promise.all([
        api.getCandidates?.(),
        api.getWatches?.(),
      ]);
      records.clear();
      for (const c of cands || []) ingest(c);
      if (Array.isArray(watches)) {
        watchCount = watches.length;
        activeWatchCount = watches.filter((w) => (w.status || 'watching') !== 'stopped').length;
      }
      render();
    } catch (err) {
      console.warn('[dev] refresh failed', err);
    }
  }

  function dropWatch(watchId) {
    for (const [key, cand] of records) {
      if (cand.watch_id === watchId) records.delete(key);
    }
    if (watchCount > 0) watchCount -= 1;
    if (activeWatchCount > 0) activeWatchCount -= 1;
    if (active) {
      render();
      refresh();
    }
  }

  function handleCandidate(msg) {
    ingest(msg);
    if (active) render();
  }

  function show() {
    active = true;
    render();
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

  const node = el('section', { class: 'page page-dev', hidden: true }, [
    el('div', { class: 'overview-head' }, [
      el('p', { class: 'eyebrow', text: 'Developer' }),
      el('h1', { class: 'overview-title head', text: 'Engine metrics.' }),
      el('p', {
        class: 'overview-sub',
        text: 'The suppression engine, measured — aggregate counts across every watch. Hidden from normal users.',
      }),
    ]),
    el('p', { class: 'dev-note', text: 'This window only appears because the local dev flag is set (localStorage.lookoutDev). Clear it to hide the nav item again.' }),
    el('div', { class: 'ratio-card' }, [
      el('div', { class: 'ratio-head' }, [
        el('div', { class: 'ratio-stat' }, [surfacedBig, el('span', { class: 'ratio-cap', text: 'surfaced' })]),
        el('span', { class: 'ratio-dot', text: '·' }),
        el('div', { class: 'ratio-stat' }, [silencedBig, el('span', { class: 'ratio-cap', text: 'silenced' })]),
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

  return { node, key: 'dev', show, hide, handleCandidate, dropWatch };
}
