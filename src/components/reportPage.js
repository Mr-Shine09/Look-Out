import { el, clear } from '../lib/dom.js';

/**
 * REPORT — one purpose: decide how the few surviving alerts reach you.
 *
 * Channels are demo toggles (delivery routing is on the roadmap). The point is
 * to close the loop: Search → Stay → Report. Because Lookout suppresses
 * aggressively, these channels stay quiet by design — only survivors get sent.
 */
const CHANNELS = [
  { id: 'dashboard', icon: '▦', title: 'This dashboard', blurb: 'Live feed, always on.', on: true, locked: true },
  { id: 'email', icon: '✉', title: 'Email digest', blurb: 'A quiet daily summary — only if something survived.' },
  { id: 'slack', icon: '#', title: 'Slack / Discord', blurb: 'A ping in your channel the moment a real one lands.' },
  { id: 'webhook', icon: '↪', title: 'Webhook', blurb: 'POST surviving alerts to your own endpoint.' },
];

export function ReportPage({ onBack }) {
  const selected = new Set(CHANNELS.filter((c) => c.on).map((c) => c.id));
  let scope = { title: 'your watch' };

  const topicEl = el('span', { class: 'report-topic', text: scope.title });
  const grid = el('div', { class: 'channel-grid' });
  const confirmMsg = el('p', { class: 'report-confirm', hidden: true });

  function renderGrid() {
    clear(grid);
    for (const ch of CHANNELS) {
      const on = selected.has(ch.id);
      const card = el(
        'button',
        {
          class: `channel-card ${on ? 'channel-card--on' : ''} ${ch.locked ? 'channel-card--locked' : ''}`,
          type: 'button',
          onClick: () => {
            if (ch.locked) return;
            if (selected.has(ch.id)) selected.delete(ch.id);
            else selected.add(ch.id);
            confirmMsg.hidden = true;
            renderGrid();
          },
        },
        [
          el('span', { class: 'channel-check', text: on ? '✓' : '' }),
          el('span', { class: 'channel-icon', text: ch.icon }),
          el('span', { class: 'channel-title', text: ch.title }),
          el('span', { class: 'channel-blurb', text: ch.blurb }),
          ch.locked ? el('span', { class: 'channel-tag', text: 'always on' }) : null,
        ]
      );
      grid.append(card);
    }
  }
  renderGrid();

  function confirm() {
    const names = CHANNELS.filter((c) => selected.has(c.id)).map((c) => c.title);
    confirmMsg.textContent = names.length
      ? `Done — surviving alerts for “${scope.title}” will reach you via ${names.join(', ')}. Everything else stays silenced.`
      : 'Pick at least one channel so survivors can reach you.';
    confirmMsg.hidden = false;
  }

  function show(next = {}) {
    scope = { title: next.title || next.query || 'your watch', watchId: next.watchId || null };
    topicEl.textContent = scope.title;
    confirmMsg.hidden = true;
  }

  const node = el('section', { class: 'page page-report', hidden: true }, [
    el('div', { class: 'report-head' }, [
      el('p', { class: 'eyebrow', text: 'Report' }),
      el('h1', { class: 'report-title head' }, ['How should we reach you about ', topicEl, '?']),
      el('p', {
        class: 'hero-sub',
        text: 'Lookout suppresses the noise first, so these channels stay quiet by design — you only hear about what survived.',
      }),
    ]),
    grid,
    el('div', { class: 'report-actions' }, [
      el('button', { class: 'ghost-btn', type: 'button', onClick: () => onBack?.(scope) }, ['← Back to feed']),
      el('button', { class: 'primary-btn', type: 'button', onClick: confirm }, ['Save delivery']),
    ]),
    confirmMsg,
  ]);

  return { node, key: 'report', onShow: () => {}, show };
}
