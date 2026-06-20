import { el, clear } from '../lib/dom.js';
import { CandidateCard } from './candidateCard.js';

const IDLE_MS = 8000; // after this with no new candidate, show honest idle state

/**
 * One vertical lane = one active watch. Streams candidate cards in newest-first,
 * tracks accept/reject counts, and shows an honest "watching… nothing new yet"
 * state when idle (intentional, not a broken-empty placeholder).
 */
export function Lane(watch, handlers) {
  const counts = { accepted: 0, rejected: 0 };

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
    countEl.firstChild.textContent = `${counts.accepted} match`;
    countEl.lastChild.textContent = `${counts.rejected} rej`;
  }

  function addCandidate(cand) {
    // Clear the initial/idle empty states once real data flows.
    feed.querySelectorAll('.lane-empty').forEach((n) => n.remove());

    if (cand.judgment === 'accepted') counts.accepted += 1;
    else counts.rejected += 1;
    updateCounts();

    feed.prepend(CandidateCard(cand, handlers));
    armIdle();
  }

  const node = el('section', { class: 'lane' }, [
    el('div', { class: 'lane-head' }, [
      el('span', { class: 'lane-dot' }),
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
