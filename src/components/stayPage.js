import { el, clear } from '../lib/dom.js';
import { CandidateCard } from './candidateCard.js';
import { Pipeline } from './pipeline.js';
import { autoApply } from '../lib/autoApply.js';

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
export function StayPage({ api, onReport }) {
  const pipeline = Pipeline();
  let scope = { watchId: null, title: 'your watch' };
  const records = new Map(); // cid -> candidate

  const handlers = {
    onFeedback: (candId, label, watchId) => api.sendFeedback(candId, label, watchId || scope.watchId),
    onAct: (candId) => {
      pipeline.reset();
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

  // ---- Header / stats ----------------------------------------------------
  const topicEl = el('span', { class: 'stay-topic', text: scope.title });
  const surfacedNum = el('span', { class: 'stat-num', text: '0' });
  const dupNum = el('span', { class: 'stat-num', text: '0' });
  const offNum = el('span', { class: 'stat-num', text: '0' });
  const seenNum = el('span', { class: 'stat-num', text: '0' });

  let showSilenced = false;
  const silenceToggle = el('button', { class: 'ghost-btn', type: 'button' }, ['Show what it silenced']);
  silenceToggle.addEventListener('click', () => {
    showSilenced = !showSilenced;
    silenceToggle.textContent = showSilenced ? 'Hide silenced' : 'Show what it silenced';
    render();
  });

  const feed = el('div', { class: 'stay-feed' });

  function classify(cand) {
    if (cand.state === 'duplicate') return 'duplicate';
    if (cand.judgment === 'accepted') return 'surfaced';
    return 'offtopic';
  }

  function updateStats() {
    let surfaced = 0;
    let dup = 0;
    let off = 0;
    for (const cand of records.values()) {
      const k = classify(cand);
      if (k === 'surfaced') surfaced += 1;
      else if (k === 'duplicate') dup += 1;
      else off += 1;
    }
    surfacedNum.textContent = String(surfaced);
    dupNum.textContent = String(dup);
    offNum.textContent = String(off);
    seenNum.textContent = String(records.size);
  }

  function render() {
    updateStats();
    clear(feed);
    const all = [...records.values()];
    const surfaced = all.filter((c) => classify(c) === 'surfaced');
    const silenced = all.filter((c) => classify(c) !== 'surfaced');

    if (!surfaced.length && !silenced.length) {
      feed.append(
        el('div', { class: 'stay-empty' }, [
          el('span', { class: 'radar' }),
          el('span', { text: 'Watching… nothing worth interrupting you yet.' }),
        ])
      );
      return;
    }

    if (surfaced.length) {
      feed.append(el('p', { class: 'feed-section-label', text: `Surfaced — worth your attention (${surfaced.length})` }));
      surfaced
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .forEach((c) => feed.append(CandidateCard(c, handlers)));
    } else {
      feed.append(
        el('div', { class: 'stay-empty' }, [
          el('span', { class: 'radar' }),
          el('span', { text: 'Nothing surfaced yet — Lookout is staying quiet.' }),
        ])
      );
    }

    if (showSilenced && silenced.length) {
      feed.append(el('p', { class: 'feed-section-label faint', text: `Silenced — duplicates & off-topic (${silenced.length})` }));
      silenced
        .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
        .forEach((c) => {
          const card = CandidateCard(c, handlers);
          card.classList.add('card--silenced');
          feed.append(card);
        });
    }
  }

  // ---- Public hooks ------------------------------------------------------
  function ingest(cand) {
    if (scope.watchId && cand.watch_id && cand.watch_id !== scope.watchId) return;
    records.set(cand.id, cand);
  }

  async function show(next = {}) {
    scope = { watchId: next.watchId || null, title: next.title || next.query || 'your watch' };
    topicEl.textContent = scope.title;
    records.clear();
    pipeline.reset();
    render();
    try {
      const existing = await api.getCandidates?.(scope.watchId);
      for (const cand of existing || []) ingest(cand);
    } catch (err) {
      console.warn('[stay] load failed', err);
    }
    render();
  }

  function handleCandidate(msg) {
    ingest(msg);
    render();
  }

  function handlePipeline(msg) {
    pipeline.update(msg);
  }

  const node = el('section', { class: 'page page-stay', hidden: true }, [
    el('div', { class: 'stay-head' }, [
      el('div', {}, [
        el('p', { class: 'eyebrow', text: 'Stay' }),
        el('h1', { class: 'stay-title head' }, ['Lookout is watching ', topicEl, ' — and staying quiet.']),
      ]),
      el('div', { class: 'stay-head-actions' }, [
        silenceToggle,
        el('button', { class: 'primary-btn', type: 'button', onClick: () => onReport?.(scope) }, ['Get these delivered →']),
      ]),
    ]),
    el('div', { class: 'stay-stats' }, [
      el('div', { class: 'stat stat--surfaced' }, [surfacedNum, el('span', { class: 'stat-label', text: 'surfaced to you' })]),
      el('div', { class: 'stat stat--dup' }, [dupNum, el('span', { class: 'stat-label', text: 'duplicates silenced' })]),
      el('div', { class: 'stat stat--off' }, [offNum, el('span', { class: 'stat-label', text: 'off-topic filtered' })]),
      el('div', { class: 'stat stat--seen' }, [seenNum, el('span', { class: 'stat-label', text: 'total updates seen' })]),
    ]),
    feed,
    pipeline.node,
  ]);

  return { node, key: 'stay', onShow: () => {}, show, handleCandidate, handlePipeline };
}
