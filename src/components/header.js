import { el } from '../lib/dom.js';

const STEPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'search', label: 'Search' },
  { key: 'stay', label: 'Stay' },
  { key: 'report', label: 'Notify' },
];

/* The mark: exactly the reference sketch — a person peering through a
   magnifying glass whose lens is their eye, hair swept up in three tufts,
   one hand gripping the handle. The mark itself is static; only the eye
   (iris + eyebrow, ".eye-move") floats up and down and blinks partway
   through the cycle (".logo-lid"), per the 5-frame reference: idle -> float
   up -> blink -> float down -> return. Colors come from the theme via CSS
   variables so the mark always matches the paper. */
const MARK_SVG = `
<svg class="brand-mark" viewBox="0 0 100 100" role="img" aria-label="Lookout" xmlns="http://www.w3.org/2000/svg">
  <path d="M17 38C13 28 15 15 25 9c8-4.6 18-3.4 24 3-4-1-8 .4-10 4 4-1 8 .6 10 4.4-4.6-2-9.6-1-13 2.4 2-.4 4 .6 4.6 2.6-5-2-10.4-.6-13.6 3.4-1.4 1.7-2.2 4-2 6.4" fill="var(--wash-peach)" stroke="var(--text)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="M17 38c-2 4-1.6 9 1 12-1 5 1.4 10 6 12 .6 4 4 7 8 7 3 3.6 8.4 4 12.4 1 3 .6 6-1 7.6-3.6 3-4.4 2.6-11-.6-15-.4-6-3-11-7-13.6-5.4-3.4-12-3-17 1-3.4-.6-7.2.4-10.4 2.4z" fill="var(--wash-blush)" stroke="var(--text)" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M22 45c-1.6.4-2.8 1.8-3 3.4" fill="none" stroke="var(--text)" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M27 62c2.4 2 5.8 2 8-.2" fill="none" stroke="var(--text)" stroke-width="1.8" stroke-linecap="round"/>
  <line x1="66" y1="52" x2="80" y2="78" stroke="var(--signal)" stroke-width="7" stroke-linecap="round"/>
  <path d="M67 68c-2-4 .4-9 5.4-10.4 5-1.4 10.6 1.4 12.6 6.2 2 4.8-.2 10-5 12.2-4.8 2.2-10.6.2-13.4-4-.8-1.2-1-2.6.4-4z" fill="var(--wash-blush)" stroke="var(--text)" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M71 65.5c1.6 1.6 4 1.8 6 .6M70 71c1.8 1.4 4.2 1.4 6-.2" fill="none" stroke="var(--text)" stroke-width="1.4" stroke-linecap="round"/>
  <circle cx="58" cy="41" r="24" fill="var(--panel)" stroke="var(--text)" stroke-width="4.6"/>
  <g class="eye-move">
    <path d="M47 30c3.4-3 8.6-3.4 12.4-1" fill="none" stroke="var(--signal)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M45.5 41 Q58 30.4 70.5 41 Q58 51.6 45.5 41 Z" fill="var(--void)" stroke="var(--text)" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="58" cy="41" r="6.6" fill="var(--signal)"/>
    <circle cx="58" cy="41" r="3" fill="var(--text)"/>
    <circle cx="60" cy="38.4" r="1.6" fill="var(--void)"/>
    <g class="logo-lid">
      <path d="M45.5 41 Q58 30.4 70.5 41 Q58 51.6 45.5 41 Z" fill="var(--panel)"/>
      <path d="M45.5 41 Q58 47.6 70.5 41" fill="none" stroke="var(--text)" stroke-width="2.2" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;

/**
 * Top bar: animated mark + the step nav (Overview · Search · Stay · Notify).
 * The active step is highlighted; setActive(key) keeps it in sync with the
 * router. A "Dev" step appears only once the local dev flag is set (#/dev).
 */
export function Header({ onNavigate, showDev = false } = {}) {
  const steps = showDev ? [...STEPS, { key: 'dev', label: 'Dev' }] : STEPS;
  const navButtons = steps.map((step) =>
    el(
      'button',
      {
        class: 'nav-step',
        type: 'button',
        dataset: { step: step.key },
        onClick: () => onNavigate?.(step.key),
      },
      [step.label]
    )
  );

  const nav = el('nav', { class: 'app-nav' }, navButtons);

  const node = el('header', { class: 'app-header' }, [
    el(
      'button',
      { class: 'brand', type: 'button', 'aria-label': 'Lookout — home', onClick: () => onNavigate?.('overview'), html: MARK_SVG }
    ),
    el('div', { class: 'spacer' }),
    nav,
    el('div', { class: 'status-pill' }, [el('span', { text: 'staying quiet' })]),
  ]);

  function setActive(key) {
    for (const btn of navButtons) {
      btn.classList.toggle('nav-step--active', btn.dataset.step === key);
    }
  }

  return { node, setActive };
}
