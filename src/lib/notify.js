/**
 * In-app "ping" for surfaced matches.
 *
 * Three layers, all best-effort and dependency-free:
 *   1. A toast that slides in (always works)
 *   2. A short WebAudio "ping" chime (no audio asset needed)
 *   3. A native browser Notification (if the user granted permission)
 *
 * The dashboard channel is "always on", so this fires whenever a live match
 * arrives flagged with `notify`. Backfilled/historical matches do NOT ping.
 */
import { el } from './dom.js';

let toastHost = null;
const seen = new Set();

function host() {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host', 'aria-live': 'polite' });
    document.body.append(toastHost);
  }
  return toastHost;
}

/** Ask for native notification permission (best-effort, needs a user gesture). */
export function requestNotifyPermission() {
  try {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const now = ctx.currentTime;
    // Two quick rising notes — a friendly "ping".
    [880, 1175].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = now + i * 0.11;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    /* audio not available — toast still shows */
  }
}

function showToast(cand) {
  const title = cand.title || 'New match';
  const source = cand.source || '';
  const url = cand.url || '';

  const body = [
    el('div', { class: 'toast-head' }, [
      el('span', { class: 'toast-bell', text: '\u{1F514}' }),
      el('span', { class: 'toast-label', text: 'Surfaced' }),
      source ? el('span', { class: 'toast-src', text: source }) : null,
    ]),
    el('div', { class: 'toast-title', text: title }),
  ];

  const card = url
    ? el('a', { class: 'toast', href: url, target: '_blank', rel: 'noopener noreferrer' }, body)
    : el('div', { class: 'toast' }, body);

  const close = el('button', {
    class: 'toast-close',
    type: 'button',
    'aria-label': 'Dismiss',
    text: '\u00D7',
    onClick: (e) => {
      e.preventDefault();
      e.stopPropagation();
      dismiss();
    },
  });
  card.append(close);

  function dismiss() {
    card.classList.add('toast--out');
    setTimeout(() => card.remove(), 240);
  }

  host().prepend(card);
  requestAnimationFrame(() => card.classList.add('toast--in'));
  setTimeout(dismiss, 7000);
}

function nativeNotify(cand) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('\u{1F514} Lookout — surfaced', {
        body: cand.title || 'A new match just landed.',
        tag: cand.id || undefined,
      });
      if (cand.url) {
        n.onclick = () => {
          window.open(cand.url, '_blank', 'noopener');
          n.close();
        };
      }
    }
  } catch {
    /* ignore */
  }
}

/** A lightweight, generic toast (used for confirmations like auto-apply). */
export function toast(message, { tone = 'info', timeout = 5000 } = {}) {
  const card = el('div', { class: `toast toast--msg toast--${tone}` }, [
    el('div', { class: 'toast-title', text: message }),
  ]);
  const close = el('button', {
    class: 'toast-close',
    type: 'button',
    'aria-label': 'Dismiss',
    text: '\u00D7',
    onClick: () => dismiss(),
  });
  card.append(close);
  function dismiss() {
    card.classList.add('toast--out');
    setTimeout(() => card.remove(), 240);
  }
  host().prepend(card);
  requestAnimationFrame(() => card.classList.add('toast--in'));
  if (timeout) setTimeout(dismiss, timeout);
  return card;
}

/** Fire the full ping for a surfaced candidate (deduped by id). */
export function pingSurfaced(cand) {
  const id = cand && cand.id;
  if (id) {
    if (seen.has(id)) return;
    seen.add(id);
  }
  showToast(cand);
  playChime();
  nativeNotify(cand);
}
