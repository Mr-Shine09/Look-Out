import { el } from '../lib/dom.js';

const fmtTime = (iso) => {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const fmtText = (value, fallback = '') => {
  if (value == null || value === '') return fallback;
  return String(value);
};

/**
 * Task 3/4 — a single candidate card.
 * Accepted vs rejected get distinct treatment; "changed" gets a teal badge.
 * Accepted cards have thumbs (optimistic feedback) + an "act" trigger.
 * Every card has a click-to-expand "why did/didn't this fire" panel.
 */
export function CandidateCard(cand, { onFeedback, onAct } = {}) {
  const accepted = cand.judgment === 'accepted';
  const title = fmtText(cand.title, 'Untitled opportunity');
  const source = fmtText(cand.source, 'Unknown source');
  const reason = fmtText(cand.reason, accepted ? 'Matched this watch.' : 'Did not match this watch.');
  const reasoning = fmtText(cand.reasoning || cand.reason, 'No detailed reasoning available.');
  const timestamp = fmtTime(cand.timestamp);
  const criteria = Array.isArray(cand.criteria) ? cand.criteria : [];

  // ---- Why panel (collapsed by default) --------------------------------
  const why = el('div', { class: 'why', style: 'display:none' }, [
    el('div', { class: 'why-label', text: "Why this fired" }),
    el('div', { text: reasoning }),
    ...criteria.map((c) => {
      const ok = Boolean(c?.ok);
      const text = typeof c === 'string' ? c : fmtText(c?.text ?? c?.label ?? c?.reason);
      if (!text) return null;
      return el('div', { class: `crit ${ok ? 'ok' : 'no'}` }, [
        el('span', { class: 'tick', text: ok ? '✓' : '✕' }),
        el('span', { text }),
      ]);
    }),
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

    const applyLabel = (label) => {
      up.classList.toggle('active', label === 'relevant');
      down.classList.toggle('active', label === 'not_relevant');
    };
    const setLabel = (label) => {
      // Optimistic UI: reflect the choice immediately, fire the call after.
      applyLabel(label);
      onFeedback?.(cand.id, label);
    };
    applyLabel(cand.label);
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
      el('div', { class: 'card-title', text: title }),
      badge,
    ]),
    el('div', { class: 'card-meta' }, [
      el('span', { class: 'src', text: source }),
      cand.location ? el('span', { text: `· ${cand.location}` }) : null,
      cand.starts_at ? el('span', { text: `· ${cand.starts_at}` }) : null,
      timestamp ? el('span', { text: `· ${timestamp}` }) : null,
    ]),
    el('div', { class: 'card-reason' }, [
      el('span', { class: 'marker', text: accepted ? '› ' : '× ' }),
      reason,
    ]),
    actions,
    why,
  ]);
}
