import { el } from '../lib/dom.js';

const STEPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'search', label: 'Search' },
  { key: 'stay', label: 'Stay' },
  { key: 'report', label: 'Notify' },
];

/* The mark: a magnifying glass whose lens is an eye. The lid group is
   painted over the eye and scaleY-animated by CSS (.logo-lid) so the eye
   occasionally blinks; the whole mark bobs (.brand-mark). Colors come from
   the theme via CSS variables so the logo always matches the paper. */
const MARK_SVG = `
<svg class="brand-mark" viewBox="0 0 48 48" role="img" aria-label="Lookout" xmlns="http://www.w3.org/2000/svg">
  <line x1="30" y1="30" x2="41.5" y2="41.5" stroke="var(--text)" stroke-width="4.8" stroke-linecap="round"/>
  <circle cx="20" cy="20" r="13.2" fill="var(--panel)" stroke="var(--text)" stroke-width="3.1"/>
  <path d="M11.5 20 Q20 12.6 28.5 20 Q20 27.4 11.5 20 Z" fill="none" stroke="var(--text)" stroke-width="1.7" stroke-linejoin="round"/>
  <circle cx="20" cy="20" r="3.7" fill="var(--signal)"/>
  <circle cx="20" cy="20" r="1.6" fill="var(--text)"/>
  <circle cx="21.3" cy="18.7" r="0.9" fill="var(--void)"/>
  <g class="logo-lid">
    <circle cx="20" cy="20" r="11.3" fill="var(--panel)"/>
    <path d="M12 20 Q20 24.5 28 20" fill="none" stroke="var(--text)" stroke-width="1.7" stroke-linecap="round"/>
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
