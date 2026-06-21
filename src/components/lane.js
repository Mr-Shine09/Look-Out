import { el, clear } from '../lib/dom.js';
import { CandidateCard } from './candidateCard.js';

const IDLE_MS = 8000; // after this with no new candidate, show honest idle state

/**
 * One vertical lane = one active watch. Streams candidate cards in newest-first,
 * tracks accept/reject counts, and shows an honest "watching… nothing new yet"
 * state when idle (intentional, not a broken-empty placeholder).
 */
export function Lane(watch, handlers = {}) {
  const counts = { accepted: 0, rejected: 0 };
  const cards = new Map();
  let sequence = 0;

  const countEl = el('div', { class: 'lane-count' }, [
    el('span', { class: 'acc', text: '0 match' }),
    el('span', { class: 'rej', text: '0 rej' }),
  ]);

  const feed = el('div', { class: 'lane-feed' });

  const emptyState = () =>
    el('div', { class: 'lane-empty' }, [
      el('span', { class: 'radar' }),
      el('span', { text: 'watching… nothing new yet' }),
    ]);

  feed.append(emptyState());

  let idleTimer = null;
  function armIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!feed.querySelector('.lane-idle')) {
        feed.prepend(
          el('div', { class: 'lane-empty lane-idle' }, [
            el('span', { class: 'radar' }),
            el('span', { text: 'watching… nothing new yet' }),
          ])
        );
      }
    }, IDLE_MS);
  }

  function updateCounts() {
    counts.accepted = 0;
    counts.rejected = 0;
    for (const record of cards.values()) {
      if (record.cand.judgment === 'accepted') counts.accepted += 1;
      else counts.rejected += 1;
    }
    countEl.firstChild.textContent = `${counts.accepted} match`;
    countEl.lastChild.textContent = `${counts.rejected} rej`;
  }

  function cardPriority(record) {
    if (record.label === 'relevant') return 0;
    if (record.cand.judgment === 'accepted' && record.label !== 'not_relevant') return 1;
    if (record.label === 'not_relevant') return 2;
    return 3;
  }

  function renderCards() {
    [...cards.values()]
      .sort((a, b) => cardPriority(a) - cardPriority(b) || b.order - a.order)
      .forEach((record) => feed.append(record.node));
  }

  function handlersFor(cand) {
    return {
      ...handlers,
      onFeedback: (candId, label) => {
        const record = cards.get(candId);
        if (record) {
          record.label = label;
          record.cand.label = label;
          record.node.dataset.feedback = label;
          renderCards();
        }
        return handlers.onFeedback?.(candId, label);
      },
    };
  }

  function addCandidate(nextCand) {
    // Clear the initial/idle empty states once real data flows.
    feed.querySelectorAll('.lane-empty').forEach((n) => n.remove());

    const cand = { ...nextCand, id: nextCand.id || `c_${Date.now()}_${sequence}` };
    const existing = cards.get(cand.id);
    const label = cand.label ?? existing?.label ?? null;
    cand.label = label;
    const node = CandidateCard(cand, handlersFor(cand));
    const record = { cand, node, label, order: ++sequence };

    if (existing) existing.node.replaceWith(node);
    cards.set(cand.id, record);
    updateCounts();
    renderCards();
    armIdle();
  }

  const node = el('section', { class: 'lane' }, [
    el('div', { class: 'lane-head' }, [
      el('span', { class: 'lane-name', title: watch.query_text, text: laneTitle(watch) }),
      countEl,
    ]),
    feed,
  ]);

  return { node, addCandidate, watchId: watch.id };
}

function laneTitle(watch) {
  const q = watch.query_text || 'watch';
  return q.length > 42 ? q.slice(0, 41) + '…' : q;
}
