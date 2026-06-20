import { el } from '../lib/dom.js';

const fmtTime = (iso) => {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

/**
 * Task 3/4 — a single candidate card.
 * Accepted vs rejected get distinct treatment; "changed" gets a teal badge.
 * Accepted cards have thumbs (optimistic feedback) + an "act" trigger.
 * Every card has a click-to-expand "why did/didn't this fire" panel.
 */
export function CandidateCard(cand, { onFeedback, onAct }) {
  const accepted = cand.judgment === 'accepted';

  // ---- Why panel (collapsed by default) --------------------------------
  const why = el('div', { class: 'why', style: 'display:none' }, [
    el('div', { class: 'why-label', text: "Why this fired" }),
    el('div', { text: cand.reasoning || cand.reason || 'No detailed reasoning available.' }),
    ...(cand.criteria || []).map((c) =>
      el('div', { class: `crit ${c.ok ? 'ok' : 'no'}` }, [
        el('span', { class: 'tick', text: c.ok ? '✓' : '✕' }),
        el('span', { text: c.text }),
      ])
    ),
  ]);

  const expandBtn = el('button', { class: 'card-expand', text: 'why ▾' });
  expandBtn.addEventListener('click', () => {
    const open = why.style.display !== 'none';
    why.style.display = open ? 'none' : 'block';
    expandBtn.textContent = open ? 'why ▾' : 'why ▴';
  });

  // ---- Thumbs (accepted only) ------------------------------------------
  let actions = null;
  if (accepted) {
    const up = el('button', { class: 'thumb up', html: '▲ <span>relevant</span>' });
    const down = el('button', { class: 'thumb down', html: '▼ <span>not</span>' });
    const act = el('button', { class: 'card-expand', text: '⚡ act', title: 'Run the agent pipeline on this match' });

    const setLabel = (label) => {
      // Optimistic UI: reflect the choice immediately, fire the call after.
      up.classList.toggle('active', label === 'relevant');
      down.classList.toggle('active', label === 'not_relevant');
      onFeedback?.(cand.id, label);
    };
    up.addEventListener('click', () => setLabel('relevant'));
    down.addEventListener('click', () => setLabel('not_relevant'));
    act.addEventListener('click', () => onAct?.(cand.id));

    actions = el('div', { class: 'card-actions' }, [up, down, act, expandBtn]);
  } else {
    actions = el('div', { class: 'card-actions' }, [expandBtn]);
  }

  // ---- Badge -----------------------------------------------------------
  let badge;
  if (cand.state === 'changed') {
    badge = el('span', { class: 'badge changed', text: 'changed' });
  } else if (accepted) {
    badge = el('span', { class: 'badge accepted', text: 'match' });
  } else {
    badge = el('span', { class: 'badge rejected', text: 'reject' });
  }

  return el('article', { class: `card ${accepted ? 'accepted' : 'rejected'}` }, [
    el('div', { class: 'card-top' }, [
      el('div', { class: 'card-title', text: cand.title }),
      badge,
    ]),
    el('div', { class: 'card-meta' }, [
      el('span', { class: 'src', text: cand.source }),
      cand.location ? el('span', { text: `· ${cand.location}` }) : null,
      cand.starts_at ? el('span', { text: `· ${cand.starts_at}` }) : null,
      el('span', { text: `· ${fmtTime(cand.timestamp)}` }),
    ]),
    el('div', { class: 'card-reason' }, [
      el('span', { class: 'marker', text: accepted ? '› ' : '× ' }),
      cand.reason || '',
    ]),
    actions,
    why,
  ]);
}
