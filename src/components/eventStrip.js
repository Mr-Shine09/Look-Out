import { el, clear } from '../lib/dom.js';

/**
 * EventStrip — a YouTube-style auto-scrolling band of real event cards.
 *
 * Pulls candidates from the API (any watch), keeps the ones that carry a
 * thumbnail, and slides them across the page in a seamless marquee. Hover
 * pauses the scroll; every card opens the real event page in a new tab.
 *
 * The strip stays hidden until it has enough cards to loop convincingly —
 * candidates arrive over time (mock drip / live backfill), so it re-polls
 * until full, then stops.
 */

const MAX_CARDS = 18; // enough variety for a loop without fetching the world
const MIN_CARDS = 4; // below this a marquee looks broken — stay hidden
const POLL_MS = 5000;
const MAX_POLLS = 24; // give up quietly after ~2 minutes of empty responses
const SECONDS_PER_CARD = 3.5; // scroll speed, scaled by how many cards loop

export function EventStrip({ api, label = 'Live from the sources Lookout watches' }) {
  const track = el('div', { class: 'strip-track' });
  const viewport = el('div', { class: 'strip-viewport' }, [track]);
  const node = el('div', { class: 'event-strip', hidden: true }, [
    el('p', { class: 'strip-label faint', text: label }),
    viewport,
  ]);

  let rendered = 0;
  let polls = 0;
  let timer = null;

  function card(cand) {
    const img = el('img', {
      class: 'strip-thumb',
      src: cand.thumbnail,
      alt: cand.title,
      loading: 'lazy',
    });
    const link = el(
      'a',
      {
        class: 'strip-card',
        href: cand.url || '#',
        target: '_blank',
        rel: 'noopener noreferrer',
        title: `Open on ${cand.source || 'source'}`,
      },
      [
        img,
        el('span', { class: 'strip-card-title', text: cand.title }),
        cand.source ? el('span', { class: 'strip-card-src', text: cand.source }) : null,
      ]
    );
    // A dead image means a dead card — drop it rather than show a broken icon.
    img.addEventListener('error', () => link.remove());
    return link;
  }

  function render(cands) {
    clear(track);
    // The keyframe slides the track by exactly half its width, so the card
    // list must repeat an even number of times (and be wider than any
    // reasonable viewport) for the loop to be seamless.
    const cardWidth = 252; // card + margin, keep in sync with the CSS
    const copies = Math.max(2, 2 * Math.ceil(window.innerWidth / (cands.length * cardWidth)));
    for (let i = 0; i < copies; i++) {
      for (const c of cands) track.append(card(c));
    }
    track.style.setProperty(
      '--strip-duration',
      `${Math.round(((cands.length * copies) / 2) * SECONDS_PER_CARD)}s`
    );
    node.hidden = false;
  }

  async function refresh() {
    polls += 1;
    let all = [];
    try {
      all = await api.getCandidates();
    } catch {
      // Backend not reachable (yet) — the next poll retries; strip stays hidden.
    }
    const seen = new Set();
    const picks = [];
    for (const c of all) {
      if (!c.thumbnail) continue;
      const key = c.url || c.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      picks.push(c);
      if (picks.length >= MAX_CARDS) break;
    }
    if (picks.length >= MIN_CARDS && picks.length !== rendered) {
      rendered = picks.length;
      render(picks);
    }
    if ((rendered >= MAX_CARDS || polls >= MAX_POLLS) && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  refresh();
  timer = setInterval(refresh, POLL_MS);

  return { node };
}
