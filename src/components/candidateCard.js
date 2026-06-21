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
export function CandidateCard(cand, { onFeedback, onAct, onApply } = {}) {
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

    // ---- Auto-apply ----------------------------------------------------
    const applied = Boolean(cand.applied);
    const applyBtn = el('button', {
      class: `card-apply${applied ? ' card-apply--done' : ''}`,
      text: applied ? '✓ applied' : '⚡ auto-apply',
      title: applied ? 'You applied to this' : 'Pre-fill your application and open registration',
    });
    if (applied) applyBtn.disabled = true;
    applyBtn.addEventListener('click', async () => {
      if (applyBtn.disabled) return;
      const prev = applyBtn.textContent;
      applyBtn.disabled = true;
      applyBtn.textContent = '… applying';
      try {
        const ok = await onApply?.(cand);
        if (ok) {
          cand.applied = true;
          applyBtn.classList.add('card-apply--done');
          applyBtn.textContent = '✓ applied';
        } else {
          applyBtn.disabled = false;
          applyBtn.textContent = prev;
        }
      } catch {
        applyBtn.disabled = false;
        applyBtn.textContent = prev;
      }
    });

    actions = el('div', { class: 'card-actions' }, [up, down, applyBtn, act, expandBtn]);
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

  // ---- Clickable media + title (open the real event in a new tab) ------
  const url = fmtText(cand.url);
  const thumb = fmtText(cand.thumbnail);

  let media = null;
  if (thumb) {
    const img = el('img', { class: 'card-thumb-img', src: thumb, alt: title, loading: 'lazy' });
    const inner = [img, el('span', { class: 'card-thumb-src', text: source })];
    media = url
      ? el('a', { class: 'card-thumb', href: url, target: '_blank', rel: 'noopener noreferrer' }, inner)
      : el('div', { class: 'card-thumb' }, inner);
    // Drop the media block entirely if the image fails to load (no broken icons).
    img.addEventListener('error', () => media.remove());
  }

  const titleNode = url
    ? el('a', {
        class: 'card-title card-title-link',
        href: url,
        target: '_blank',
        rel: 'noopener noreferrer',
        title: `Open on ${source}`,
        text: title,
      })
    : el('div', { class: 'card-title', text: title });

  const body = el('div', { class: 'card-body' }, [
    el('div', { class: 'card-top' }, [titleNode, badge]),
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

  return el('article', { class: `card ${accepted ? 'accepted' : 'rejected'}${thumb ? ' has-thumb' : ''}` }, [
    media,
    body,
  ]);
}
