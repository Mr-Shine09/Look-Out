import { el } from '../lib/dom.js';

/**
 * NOTIFY — one purpose: push what survived to Discord.
 *
 * Discord is the only channel wired end-to-end (webhook configured in
 * `.env`, `lookout/notify.py` already formats rich embeds) — everything
 * else was a dead option nobody could actually click. Sending POSTs the
 * watch's current surfaced (non-expired) candidates to the backend, which
 * relays them to the configured webhook and reports back success/failure.
 */
export function ReportPage({ api, onBack }) {
  let scope = { title: 'your watch', watchId: null };

  const topicEl = el('span', { class: 'report-topic', text: scope.title });
  const confirmMsg = el('p', { class: 'report-confirm', hidden: true });

  const sendBtn = el(
    'button',
    { class: 'primary-btn', type: 'button', onClick: send },
    ['Send to Discord →']
  );

  async function send() {
    if (!scope.watchId) {
      confirmMsg.textContent = 'Create a watch first — there is nothing to send yet.';
      confirmMsg.className = 'report-confirm report-confirm--error';
      confirmMsg.hidden = false;
      return;
    }
    sendBtn.disabled = true;
    confirmMsg.hidden = true;
    try {
      const res = await api.notifyWatch?.(scope.watchId);
      if (res?.ok) {
        confirmMsg.textContent = `Sent ${res.sent} surfaced event${res.sent === 1 ? '' : 's'} to Discord.`;
        confirmMsg.className = 'report-confirm report-confirm--ok';
      } else {
        confirmMsg.textContent = res?.error || 'Discord delivery failed.';
        confirmMsg.className = 'report-confirm report-confirm--error';
      }
    } catch (err) {
      console.error('[report] notifyWatch failed', err);
      confirmMsg.textContent = String(err?.message || err).replace(/^\d+(\s\w+)?:\s*/, '') || 'Discord delivery failed.';
      confirmMsg.className = 'report-confirm report-confirm--error';
    } finally {
      confirmMsg.hidden = false;
      sendBtn.disabled = false;
    }
  }

  function show(next = {}) {
    scope = { title: next.title || next.query || 'your watch', watchId: next.watchId || null };
    topicEl.textContent = scope.title;
    confirmMsg.hidden = true;
  }

  const node = el('section', { class: 'page page-report', hidden: true }, [
    el('div', { class: 'report-head' }, [
      el('p', { class: 'eyebrow', text: 'Notify' }),
      el('h1', { class: 'report-title head' }, ['Send what survived for ', topicEl, ' to Discord.']),
      el('p', {
        class: 'hero-sub',
        text: 'Discord is the only channel wired up right now — more channels coming. Lookout suppresses the noise first, so this stays quiet until something real surfaces.',
      }),
    ]),
    el('div', { class: 'report-actions' }, [
      el('button', { class: 'ghost-btn', type: 'button', onClick: () => onBack?.(scope) }, ['← Back to feed']),
      sendBtn,
    ]),
    confirmMsg,
  ]);

  return { node, key: 'report', onShow: () => {}, show };
}
