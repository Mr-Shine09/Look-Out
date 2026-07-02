import { el, clear } from '../lib/dom.js';
import { EventStrip } from './eventStrip.js';
import { classify } from '../lib/classify.js';

function timeAgo(iso) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

/**
 * OVERVIEW — the functional front page: what Lookout is doing for you.
 *
 * Not a metrics dashboard. It shows your watches (status + what each has
 * surfaced) and the most recent events that actually made it through the
 * suppression engine, with click-through to Stay. Aggregate engine metrics
 * live in the hidden developer window instead (devPage.js).
 */
export function OverviewPage({ api, onOpenWatch, onNewSearch }) {
  const records = new Map(); // watch_id::id -> candidate (across all watches)
  let watches = [];
  let pollTimer = null;
  let active = false;

  const strip = EventStrip({ api, label: 'Live from the sources Lookout watches' });

  const watchCountCap = el('span', { class: 'count', text: '' });
  const watchList = el('div', { class: 'watch-list' });
  const recentList = el('div', { class: 'recent-list' });

  // The backend reuses one event `id` across every watch that judged it, so
  // key the aggregate by watch_id + id (one judgment per watch).
  const keyOf = (cand) => `${cand.watch_id || ''}::${cand.id}`;

  function ingest(cand) {
    if (!cand || !cand.id) return false;
    const key = keyOf(cand);
    const had = records.has(key);
    records.set(key, cand);
    return !had;
  }

  function surfacedCountFor(watchId) {
    let n = 0;
    for (const c of records.values()) {
      if (c.watch_id === watchId && classify(c) === 'surfaced') n += 1;
    }
    return n;
  }

  function renderWatches() {
    clear(watchList);
    watchCountCap.textContent = watches.length ? `· ${watches.length}` : '';
    if (!watches.length) {
      watchList.append(
        el('div', { class: 'ov-empty' }, [
          el('span', { text: 'Nothing is being watched yet. Tell Lookout what to look out for and it will stay quiet until something matters.' }),
          el('button', { class: 'primary-btn', type: 'button', onClick: () => onNewSearch?.() }, ['Start a search →']),
        ])
      );
      return;
    }
    for (const w of watches) {
      const status = w.status || 'watching';
      const surfaced = surfacedCountFor(w.id);
      const dotClass =
        status === 'stopped' ? 'watch-dot watch-dot--stopped'
        : status === 'compiling' ? 'watch-dot watch-dot--compiling'
        : 'watch-dot';
      watchList.append(
        el(
          'button',
          {
            class: 'watch-row',
            type: 'button',
            onClick: () => onOpenWatch?.({ watchId: w.id, title: w.query_text }),
          },
          [
            el('span', { class: dotClass }),
            el('span', { class: 'watch-name', text: w.query_text }),
            el('span', { class: 'watch-meta' }, [
              el('span', { class: 'watch-surfaced', text: `${surfaced} surfaced` }),
              el('span', { class: 'watch-state', text: status === 'stopped' ? 'paused' : status }),
            ]),
          ]
        )
      );
    }
  }

  function renderRecent() {
    clear(recentList);
    const surfaced = [];
    for (const c of records.values()) {
      if (classify(c) === 'surfaced') surfaced.push(c);
    }
    surfaced.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const top = surfaced.slice(0, 6);
    if (!top.length) {
      recentList.append(
        el('p', { class: 'recent-empty', text: 'Nothing surfaced yet — when an event clears the bar, it shows up here.' })
      );
      return;
    }
    for (const c of top) {
      const row = el(
        c.url ? 'a' : 'button',
        c.url
          ? { class: 'recent-row', href: c.url, target: '_blank', rel: 'noopener noreferrer' }
          : {
              class: 'recent-row',
              type: 'button',
              onClick: () => onOpenWatch?.({ watchId: c.watch_id, title: c.title }),
            },
        [
          el('span', { class: 'recent-title', text: c.title }),
          el('span', { class: 'recent-meta', text: `${c.source}${c.timestamp ? ` · ${timeAgo(c.timestamp)}` : ''}` }),
        ]
      );
      recentList.append(row);
    }
  }

  function render() {
    renderWatches();
    renderRecent();
  }

  async function refresh() {
    try {
      const [cands, watchesRes] = await Promise.all([
        api.getCandidates?.(),
        api.getWatches?.(),
      ]);
      // Rebuild from the authoritative list so deletions prune themselves —
      // ingest-only accumulation would keep a deleted watch's candidates around.
      records.clear();
      for (const c of cands || []) ingest(c);
      if (Array.isArray(watchesRes)) watches = watchesRes;
      render();
    } catch (err) {
      console.warn('[overview] refresh failed', err);
    }
  }

  // A watch was deleted elsewhere — drop it and its candidates immediately so
  // the page updates without waiting for the next poll.
  function dropWatch(watchId) {
    for (const [key, cand] of records) {
      if (cand.watch_id === watchId) records.delete(key);
    }
    watches = watches.filter((w) => w.id !== watchId);
    if (active) {
      render();
      refresh();
    }
  }

  // Live push from the shared feed dispatch (see main.js).
  function handleCandidate(msg) {
    ingest(msg);
    if (active) render();
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
      el('h1', { class: 'overview-title head', text: 'On the lookout for you.' }),
      el('p', {
        class: 'overview-sub',
        text: 'Every watch you have running, and the few events that actually cleared the bar.',
      }),
    ]),
    strip.node,
    el('div', { class: 'ov-section' }, [
      el('p', { class: 'ov-section-label' }, ['Your watches ', watchCountCap]),
      watchList,
    ]),
    el('div', { class: 'ov-section' }, [
      el('p', { class: 'ov-section-label' }, ['Recently surfaced']),
      recentList,
    ]),
  ]);

  return { node, key: 'overview', show, hide, handleCandidate, dropWatch };
}
