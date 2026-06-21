import { el, clear } from '../lib/dom.js';
import { pingSurfaced, requestNotifyPermission } from '../lib/notify.js';

/**
 * REPORT — one purpose: decide how the few surviving alerts reach you.
 *
 * Three parts: a lightweight (mock) sign-in so delivery is tied to "you",
 * delivery CHANNELS with real target fields, and generic AI-AGENT CONNECTORS
 * that receive surfaced alerts so any agent can act on them. Config persists to
 * localStorage (no backend / no real auth in this phase). Because Lookout
 * suppresses aggressively, everything here stays quiet by design.
 */
const STORAGE_USER = 'lookout_user';
const STORAGE_DELIVERY = 'lookout_delivery';

const CHANNELS = [
  { id: 'dashboard', icon: '▦', title: 'This dashboard', blurb: 'Live feed, always on.', locked: true },
  {
    id: 'email',
    icon: '✉',
    title: 'Email digest',
    blurb: 'A quiet daily summary — only if something survived.',
    targetLabel: 'Send to',
    placeholder: 'you@example.com',
  },
  {
    id: 'slack',
    icon: '#',
    title: 'Slack / Discord',
    blurb: 'A ping in your channel the moment a real one lands.',
    targetLabel: 'Incoming webhook URL',
    placeholder: 'https://hooks.slack.com/services/…',
  },
  {
    id: 'webhook',
    icon: '↪',
    title: 'Webhook',
    blurb: 'POST surviving alerts to your own endpoint.',
    targetLabel: 'POST endpoint',
    placeholder: 'https://api.yourapp.com/lookout',
  },
];

const CONNECTOR_TEMPLATES = [
  {
    key: 'claude',
    name: 'Claude agent',
    endpoint: 'https://api.anthropic.com/v1/messages',
    hint: 'Hand each surviving alert to a Claude agent to triage or draft a response.',
  },
  {
    key: 'mcp',
    name: 'MCP endpoint',
    endpoint: 'http://localhost:8787/mcp',
    hint: 'Expose survivors to any MCP-compatible tool or agent.',
  },
  {
    key: 'custom',
    name: 'Custom agent',
    endpoint: '',
    hint: 'Any agent that can receive a webhook POST.',
  },
];

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

function defaultConfig() {
  return {
    channels: {
      dashboard: { on: true },
      email: { on: false, target: '' },
      slack: { on: false, target: '' },
      webhook: { on: false, target: '' },
    },
    connectors: [],
  };
}

let _connectorSeq = 0;
const nextConnectorId = () => `cn_${Date.now().toString(36)}_${++_connectorSeq}`;

export function ReportPage({ api, onBack }) {
  let scope = { title: 'your watch' };
  let user = loadJSON(STORAGE_USER, null); // { name, email } | null
  const config = Object.assign(defaultConfig(), loadJSON(STORAGE_DELIVERY, {}));

  const topicEl = el('span', { class: 'report-topic', text: scope.title });
  const loginBox = el('div', { class: 'login-box' });
  const grid = el('div', { class: 'channel-grid reveal' });
  const connectorsList = el('div', { class: 'connectors-list reveal' });
  const confirmMsg = el('p', { class: 'report-confirm', hidden: true });

  // ---- Mock login --------------------------------------------------------
  function renderLogin() {
    clear(loginBox);
    if (user?.email) {
      loginBox.append(
        el('div', { class: 'login-signedin' }, [
          el('span', { class: 'login-avatar', text: (user.name || user.email)[0].toUpperCase() }),
          el('div', { class: 'login-who' }, [
            el('span', { class: 'login-name', text: user.name || user.email }),
            el('span', { class: 'login-mail', text: `Delivering to ${user.email}` }),
          ]),
          el('button', {
            class: 'ghost-btn login-out',
            type: 'button',
            onClick: () => {
              user = null;
              saveJSON(STORAGE_USER, null);
              renderLogin();
            },
          }, ['Sign out']),
        ])
      );
      return;
    }
    const nameInput = el('input', { class: 'adv-input', type: 'text', placeholder: 'Name (optional)' });
    const mailInput = el('input', { class: 'adv-input', type: 'email', placeholder: 'you@example.com' });
    const signIn = () => {
      const email = mailInput.value.trim();
      if (!email) {
        mailInput.focus();
        mailInput.classList.add('search-input--nudge');
        setTimeout(() => mailInput.classList.remove('search-input--nudge'), 400);
        return;
      }
      user = { name: nameInput.value.trim(), email };
      saveJSON(STORAGE_USER, user);
      renderLogin();
    };
    mailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') signIn();
    });
    loginBox.append(
      el('div', { class: 'login-form' }, [
        el('span', { class: 'login-hint', text: 'Sign in to attach delivery to you (demo — no password).' }),
        el('div', { class: 'login-fields' }, [
          nameInput,
          mailInput,
          el('button', { class: 'primary-btn', type: 'button', onClick: signIn }, ['Sign in']),
        ]),
      ])
    );
  }

  // ---- Delivery channels -------------------------------------------------
  function renderGrid() {
    clear(grid);
    for (const ch of CHANNELS) {
      const state = config.channels[ch.id] || { on: false };
      const on = ch.locked ? true : Boolean(state.on);

      const header = el('div', { class: 'channel-head' }, [
        el('span', { class: 'channel-icon', text: ch.icon }),
        el('div', { class: 'channel-text' }, [
          el('span', { class: 'channel-title', text: ch.title }),
          el('span', { class: 'channel-blurb', text: ch.blurb }),
        ]),
        ch.locked
          ? el('span', { class: 'channel-tag', text: 'always on' })
          : toggleSwitch(on, () => {
              state.on = !state.on;
              config.channels[ch.id] = state;
              confirmMsg.hidden = true;
              renderGrid();
            }),
      ]);

      const children = [header];
      if (!ch.locked && on) {
        const target = el('input', {
          class: 'adv-input channel-target',
          type: 'text',
          value: state.target || '',
          placeholder: ch.placeholder,
        });
        target.addEventListener('input', () => {
          state.target = target.value;
          config.channels[ch.id] = state;
        });
        const test = el('button', { class: 'ghost-btn channel-test', type: 'button' }, ['Test send']);
        const testMsg = el('span', { class: 'channel-test-msg', text: '' });
        test.addEventListener('click', () => {
          testMsg.textContent = state.target ? '✓ test alert queued' : 'add a target first';
          setTimeout(() => (testMsg.textContent = ''), 2200);
        });
        children.push(
          el('div', { class: 'channel-target-row' }, [
            el('label', { class: 'adv-label', text: ch.targetLabel }),
            target,
            el('div', { class: 'channel-test-row' }, [test, testMsg]),
          ])
        );
      }

      grid.append(el('div', { class: `channel-card ${on ? 'channel-card--on' : ''}` }, children));
    }
  }

  // ---- AI-agent connectors ----------------------------------------------
  function alertPreview() {
    return JSON.stringify(
      {
        event: 'surfaced_alert',
        watch: scope.title,
        candidate: {
          title: 'NEW: SF In-Person LLM Agents Hackathon — Just Opened',
          source: 'Devpost',
          url: 'https://example.com/sf-llm-agents',
          judgment: 'accepted',
          reason: 'In-person LLM hackathon in SF — registration just opened.',
        },
        delivered_at: '2026-07-18T17:04:00Z',
      },
      null,
      2
    );
  }

  function renderConnectors() {
    clear(connectorsList);
    if (!config.connectors.length) {
      connectorsList.append(
        el('p', { class: 'connectors-empty', text: 'No agents connected yet. Add one below to let it act on survivors.' })
      );
    }
    config.connectors.forEach((cn) => {
      const nameInput = el('input', { class: 'adv-input', type: 'text', value: cn.name || '', placeholder: 'Agent name' });
      nameInput.addEventListener('input', () => (cn.name = nameInput.value));
      const epInput = el('input', { class: 'adv-input', type: 'text', value: cn.endpoint || '', placeholder: 'https://…' });
      epInput.addEventListener('input', () => (cn.endpoint = epInput.value));
      const tokInput = el('input', { class: 'adv-input', type: 'password', value: cn.token || '', placeholder: 'API token (optional)' });
      tokInput.addEventListener('input', () => (cn.token = tokInput.value));

      const preview = el('pre', { class: 'connector-preview', hidden: true, text: alertPreview() });
      const previewBtn = el('button', { class: 'card-expand', type: 'button', text: 'what it receives ▾' });
      previewBtn.addEventListener('click', () => {
        const open = !preview.hidden;
        preview.hidden = open;
        previewBtn.textContent = open ? 'what it receives ▾' : 'what it receives ▴';
      });

      const card = el('div', { class: `connector-card ${cn.on ? 'connector-card--on' : ''}` }, [
        el('div', { class: 'connector-head' }, [
          el('span', { class: 'connector-icon', text: '◆' }),
          el('div', { class: 'connector-fields' }, [
            el('label', { class: 'adv-label', text: 'Agent' }),
            nameInput,
          ]),
          toggleSwitch(Boolean(cn.on), () => {
            cn.on = !cn.on;
            renderConnectors();
          }),
          el('button', {
            class: 'connector-remove',
            type: 'button',
            title: 'remove',
            onClick: () => {
              config.connectors = config.connectors.filter((c) => c.id !== cn.id);
              renderConnectors();
            },
          }, ['×']),
        ]),
        el('div', { class: 'connector-grid' }, [
          el('div', { class: 'adv-field' }, [el('label', { class: 'adv-label', text: 'Endpoint' }), epInput]),
          el('div', { class: 'adv-field' }, [el('label', { class: 'adv-label', text: 'Auth token' }), tokInput]),
        ]),
        el('div', { class: 'connector-foot' }, [previewBtn]),
        preview,
      ]);
      connectorsList.append(card);
    });
  }

  const addRow = el(
    'div',
    { class: 'connector-add' },
    CONNECTOR_TEMPLATES.map((t) =>
      el('button', {
        class: 'connector-add-btn',
        type: 'button',
        title: t.hint,
        onClick: () => {
          config.connectors.push({ id: nextConnectorId(), name: t.name, endpoint: t.endpoint, token: '', on: true });
          renderConnectors();
        },
      }, [el('span', { class: 'connector-add-plus', text: '+' }), t.name])
    )
  );

  // ---- Save --------------------------------------------------------------
  async function save() {
    saveJSON(STORAGE_DELIVERY, config);
    if (user) saveJSON(STORAGE_USER, user);
    const channelNames = CHANNELS.filter((c) => c.locked || config.channels[c.id]?.on).map((c) => c.title);
    const agents = config.connectors.filter((c) => c.on).length;
    const who = user?.email ? ` to ${user.email}` : '';

    // Wire the chosen channels to the live backend so pings actually fire.
    const enabled = CHANNELS.filter((c) => c.locked || config.channels[c.id]?.on).map((c) => c.id);
    let testNote = '';
    try {
      const res = await api.saveDelivery?.({
        channels: enabled,
        discord_webhook: config.channels.slack?.target || '',
        webhook_url: config.channels.webhook?.target || '',
        email: config.channels.email?.target || user?.email || '',
        test: true,
      });
      const sent = (res && res.test && res.test.sent) || [];
      if (sent.length) testNote = ` Sent a test ping to ${sent.join(', ')}.`;
    } catch (err) {
      console.error('[report] saveDelivery failed', err);
    }
    // The dashboard channel is always on -> fire the in-app ping so it's demonstrably live.
    requestNotifyPermission();
    pingSurfaced({ id: `test_${Date.now()}`, title: `Test ping — ${scope.title}`, source: 'Lookout', url: '' });

    confirmMsg.textContent = `Saved${who} — survivors for “${scope.title}” route via ${channelNames.join(', ')}${
      agents ? ` and ${agents} AI agent${agents === 1 ? '' : 's'}` : ''
    }. Everything else stays silenced.${testNote}`;
    confirmMsg.hidden = false;
  }

  function show(next = {}) {
    scope = { title: next.title || next.query || 'your watch', watchId: next.watchId || null };
    topicEl.textContent = scope.title;
    confirmMsg.hidden = true;
    renderLogin();
    renderGrid();
    renderConnectors();
  }

  renderLogin();
  renderGrid();
  renderConnectors();

  const node = el('section', { class: 'page page-report', hidden: true }, [
    el('div', { class: 'report-head' }, [
      el('p', { class: 'eyebrow', text: 'Notify' }),
      el('h1', { class: 'report-title head' }, ['How should we reach you about ', topicEl, '?']),
      el('p', {
        class: 'hero-sub',
        text: 'Lookout suppresses the noise first, so these channels stay quiet by design — you only hear about what survived.',
      }),
    ]),
    loginBox,
    el('h2', { class: 'report-section-title', text: 'Delivery channels' }),
    grid,
    el('h2', { class: 'report-section-title', text: 'AI agent connectors' }),
    el('p', { class: 'report-section-sub faint', text: 'Each surviving alert is POSTed to every enabled agent so it can triage or act.' }),
    connectorsList,
    addRow,
    el('div', { class: 'report-actions' }, [
      el('button', { class: 'ghost-btn', type: 'button', onClick: () => onBack?.(scope) }, ['← Back to feed']),
      el('button', { class: 'primary-btn', type: 'button', onClick: save }, ['Save delivery']),
    ]),
    confirmMsg,
  ]);

  return { node, key: 'report', onShow: () => {}, show };
}

/** Small on/off switch button. */
function toggleSwitch(on, onToggle) {
  const btn = el('button', {
    class: `switch ${on ? 'switch--on' : ''}`,
    type: 'button',
    role: 'switch',
    'aria-checked': on ? 'true' : 'false',
    onClick: onToggle,
  }, [el('span', { class: 'switch-knob' })]);
  return btn;
}
