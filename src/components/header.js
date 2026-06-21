import { el } from '../lib/dom.js';

const STEPS = [
  { key: 'search', label: 'Search' },
  { key: 'stay', label: 'Stay' },
  { key: 'report', label: 'Report' },
];

/**
 * Top bar: brand + the three-step nav (Search · Stay · Report). The active
 * step is highlighted; setActive(key) keeps it in sync with the router.
 */
export function Header({ onNavigate } = {}) {
  const navButtons = STEPS.map((step) =>
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
    el('button', { class: 'brand', type: 'button', onClick: () => onNavigate?.('search') }, [
      el('div', { class: 'logo' }, ['Look', el('span', { class: 'eye', text: 'out' })]),
      el('div', { class: 'tagline', text: '// built to notify you less' }),
    ]),
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
