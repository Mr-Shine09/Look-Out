import { el } from '../lib/dom.js';

/** Top bar: brand + a live "watching" status pill. */
export function Header() {
  return el('header', { class: 'app-header' }, [
    el('div', { class: 'brand' }, [
      el('div', { class: 'logo' }, [
        'Look',
        el('span', { class: 'eye', text: 'out' }),
      ]),
      el('div', { class: 'tagline', text: '// a tireless watcher for live opportunities' }),
    ]),
    el('div', { class: 'spacer' }),
    el('div', { class: 'status-pill' }, [
      el('span', { class: 'dot' }),
      el('span', { text: 'watching live' }),
    ]),
  ]);
}
