import { el, clear } from '../lib/dom.js';
import { pingSurfaced, requestNotifyPermission } from '../lib/notify.js';

/**
 * REPORT — one purpose: decide how the few surviving alerts reach you.
 *
 * Channels are demo toggles (delivery routing is on the roadmap). The point is
 * to close the loop: Search → Stay → Report. Because Lookout suppresses
 * aggressively, these channels stay quiet by design — only survivors get sent.
 */
const CHANNELS = [
  { id: 'dashboard', icon: '▦', title: 'This dashboard', blurb: 'Live feed + a ping toast & sound. Always on.', on: true, locked: true },
  { id: 'email', icon: '✉', title: 'Email digest', blurb: 'A quiet daily summary — only if something survived.', field: 'email', placeholder: 'you@example.com' },
  { id: 'slack', icon: '#', title: 'Slack / Discord', blurb: 'A ping in your channel the moment a real one lands.', field: 'discord_webhook', placeholder: 'https://discord.com/api/webhooks/…' },
  { id: 'webhook', icon: '↪', title: 'Webhook', blurb: 'POST surviving alerts to your own endpoint.', field: 'webhook_url', placeholder: 'https://your.app/webhook' },
];

export function ReportPage({ api, onBack }) {
  const selected = new Set(CHANNELS.filter((c) => c.on).map((c) => c.id));
  const urls = { email: '', discord_webhook: '', webhook_url: '' };
  let scope = { title: 'your watch' };

  const topicEl = el('span', { class: 'report-topic', text: scope.title });
  const grid = el('div', { class: 'channel-grid' });
  const confirmMsg = el('p', { class: 'report-confirm', hidden: true });

  function renderGrid() {
    clear(grid);
    for (const ch of CHANNELS) {
      const on = selected.has(ch.id);
      const parts = [
        el('span', { class: 'channel-check', text: on ? '✓' : '' }),
        el('span', { class: 'channel-icon', text: ch.icon }),
        el('span', { class: 'channel-title', text: ch.title }),
        el('span', { class: 'channel-blurb', text: ch.blurb }),
        ch.locked ? el('span', { class: 'channel-tag', text: 'always on' }) : null,
      ];
      if (ch.field && on) {
        const input = el('input', {
          class: 'channel-input',
          type: ch.field === 'email' ? 'email' : 'url',
          placeholder: ch.placeholder || '',
          value: urls[ch.field] || '',
        });
        input.addEventListener('input', () => {
          urls[ch.field] = input.value.trim();
        });
        input.addEventListener('click', (e) => e.stopPropagation());
        parts.push(el('div', { class: 'channel-input-wrap' }, [input]));
      }
      const card = el(
        'div',
        {
          class: `channel-card ${on ? 'channel-card--on' : ''} ${ch.locked ? 'channel-card--locked' : ''}`,
          onClick: (e) => {
            if (e.target.closest('.channel-input-wrap')) return;
            if (ch.locked) return;
            if (selected.has(ch.id)) selected.delete(ch.id);
            else selected.add(ch.id);
            confirmMsg.hidden = true;
            renderGrid();
          },
        },
        parts
      );
      grid.append(card);
    }
  }
  renderGrid();

  async function confirm() {
    const names = CHANNELS.filter((c) => selected.has(c.id)).map((c) => c.title);
    if (!names.length) {
      confirmMsg.textContent = 'Pick at least one channel so survivors can reach you.';
      confirmMsg.hidden = false;
      return;
    }
    confirmMsg.textContent = 'Saving…';
    confirmMsg.hidden = false;
    try {
      const res = await api.saveDelivery({
        channels: [...selected],
        discord_webhook: urls.discord_webhook,
        webhook_url: urls.webhook_url,
        email: urls.email,
        test: true,
      });
      const sent = (res && res.test && res.test.sent) || [];
      // Fire the in-app ping so the dashboard channel is demonstrably live.
      if (selected.has('dashboard')) {
        requestNotifyPermission();
        pingSurfaced({
          id: `test_${Date.now()}`,
          title: `Test ping — ${scope.title}`,
          source: 'Lookout',
          url: '',
        });
      }
      const channelMsg = sent.length ? ` Sent a test ping to ${sent.join(', ')}.` : '';
      confirmMsg.textContent = `Done — surviving alerts for “${scope.title}” will reach you via ${names.join(', ')}. Everything else stays silenced.${channelMsg}`;
    } catch (err) {
      console.error('[report] saveDelivery failed', err);
      confirmMsg.textContent = 'Could not save delivery settings. Is the backend running?';
    }
  }

  function show(next = {}) {
    scope = { title: next.title || next.query || 'your watch', watchId: next.watchId || null };
    topicEl.textContent = scope.title;
    confirmMsg.hidden = true;
    if (api && api.getDelivery) {
      api
        .getDelivery()
        .then((cfg) => {
          if (!cfg) return;
          if (Array.isArray(cfg.channels) && cfg.channels.length) {
            selected.clear();
            cfg.channels.forEach((c) => selected.add(c));
            selected.add('dashboard');
          }
          urls.discord_webhook = cfg.discord_webhook || '';
          urls.webhook_url = cfg.webhook_url || '';
          urls.email = cfg.email || '';
          renderGrid();
        })
        .catch(() => {});
    }
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
