import { el, clear } from '../lib/dom.js';

/**
 * SEARCH — the front door. One purpose: tell Lookout the exact thing to watch.
 *
 * A single search field (type what you want) + filter checkboxes that narrow the
 * request (and keep the backend scoped, not firing on random noise). Below it,
 * a few curated examples ("what Lookout can do") that map to ready test cases.
 *
 * onFollow({ query, filters, watchId, title }) is called when the user commits a
 * search or picks an example. If watchId is present we reuse an existing feed
 * (instant); otherwise the query is compiled into a new feed.
 */

// Curated, demo-safe starting points. Items with a watchId reuse a seeded feed
// so the demo is instant and costs no tokens; others compile a fresh feed.
const EXAMPLES = [
  {
    icon: '◎',
    title: 'New AI / ML events near me',
    blurb: 'In-person ML & AI meetups, hackathons and demo nights around SF.',
    query: 'Alert me when a new in-person ML/AI event opens registration near San Francisco',
    watchId: 'w_ml_hack',
  },
  {
    icon: '✦',
    title: 'AI research funds & fellowships',
    blurb: 'Open grants and fellowships for early-career AI researchers.',
    query: 'Watch for new AI research grants or fellowships open to early-career researchers',
    watchId: 'w_grants',
  },
];

const TIME_WINDOWS = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'any', label: 'Any time' },
];

const NOTIFY_FREQ = [
  { id: 'realtime', label: 'Real-time' },
  { id: 'daily', label: 'Daily digest' },
  { id: 'weekly', label: 'Weekly digest' },
];

const TYPES = [
  { id: 'events', text: 'Events' },
  { id: 'hackathons', text: 'Hackathons' },
  { id: 'funding', text: 'Funding' },
];

const SOURCES = [
  { id: 'luma', text: 'Luma' },
  { id: 'devpost', text: 'Devpost' },
  { id: 'mlh', text: 'MLH' },
  { id: 'eventbrite', text: 'Eventbrite' },
];

const RADII = [
  { id: '10', label: '10 mi' },
  { id: '50', label: '50 mi' },
  { id: '100', label: '100 mi' },
  { id: 'any', label: 'Any distance' },
];

// Strictness dial → how aggressively Lookout suppresses. Higher = stricter
// dedup similarity threshold + a harder relevance bar (fewer, surer alerts).
const STRICTNESS_LABELS = [
  { upTo: 33, text: 'Loose — closer to a raw feed (more noise)' },
  { upTo: 66, text: 'Balanced — sensible suppression' },
  { upTo: 100, text: 'Strict — only near-certain, non-duplicate matches' },
];

function strictnessText(v) {
  return (STRICTNESS_LABELS.find((s) => v <= s.upTo) || STRICTNESS_LABELS[1]).text;
}

/** A small labeled field wrapper for the advanced panel. */
function field(label, control, hint) {
  return el('div', { class: 'adv-field' }, [
    el('label', { class: 'adv-label', text: label }),
    control,
    hint ? el('span', { class: 'adv-hint', text: hint }) : null,
  ]);
}

/** Pill-style multi-select. Returns { node, get() }. */
function pillGroup(options, initial = []) {
  const chosen = new Set(initial);
  const node = el('div', { class: 'adv-pills' });
  function render() {
    clear(node);
    for (const opt of options) {
      const on = chosen.has(opt.id);
      node.append(
        el(
          'button',
          {
            class: `chip ${on ? 'chip--on' : ''}`,
            type: 'button',
            onClick: () => {
              if (chosen.has(opt.id)) chosen.delete(opt.id);
              else chosen.add(opt.id);
              render();
            },
          },
          [el('span', { class: 'chip-check', text: on ? '✓' : '+' }), el('span', { text: opt.text })]
        )
      );
    }
  }
  render();
  return { node, get: () => [...chosen] };
}

/** Keyword chip input. Enter adds a chip; click a chip to remove. */
function keywordInput(placeholder, accent) {
  const words = [];
  const chips = el('div', { class: 'kw-chips' });
  const input = el('input', {
    class: 'kw-input',
    type: 'text',
    placeholder,
    autocomplete: 'off',
    spellcheck: 'false',
  });
  function render() {
    clear(chips);
    words.forEach((w, i) => {
      chips.append(
        el(
          'button',
          {
            class: `kw-chip kw-chip--${accent}`,
            type: 'button',
            title: 'remove',
            onClick: () => {
              words.splice(i, 1);
              render();
            },
          },
          [el('span', { text: w }), el('span', { class: 'kw-x', text: '×' })]
        )
      );
    });
    chips.append(input);
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const v = input.value.trim().replace(/,$/, '');
      if (v && !words.includes(v)) words.push(v);
      input.value = '';
      render();
      input.focus();
    } else if (e.key === 'Backspace' && !input.value && words.length) {
      words.pop();
      render();
      input.focus();
    }
  });
  render();
  return { node: el('div', { class: 'kw-wrap' }, [chips]), get: () => [...words] };
}

export function SearchPage({ onFollow }) {
  const input = el('input', {
    class: 'search-input',
    type: 'text',
    placeholder: 'Tell Lookout exactly what to watch for…',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  // ---- Advanced controls -------------------------------------------------
  const locText = el('input', {
    class: 'adv-input',
    type: 'text',
    value: 'San Francisco',
    placeholder: 'City or region',
    autocomplete: 'off',
  });
  const radiusSel = selectEl(RADII, '100');
  const onlineChk = checkboxEl('Online events are OK');

  const timeSel = selectEl(TIME_WINDOWS, 'month');
  const types = pillGroup(TYPES, ['events', 'hackathons']);
  const sources = pillGroup(SOURCES, []);

  const strictness = el('input', {
    class: 'adv-range',
    type: 'range',
    min: '0',
    max: '100',
    value: '55',
    step: '1',
  });
  const strictnessOut = el('span', { class: 'adv-range-out', text: strictnessText(55) });
  strictness.addEventListener('input', () => {
    strictnessOut.textContent = strictnessText(Number(strictness.value));
  });

  const freqSel = selectEl(NOTIFY_FREQ, 'daily');
  const quietChk = checkboxEl('Respect quiet hours (10pm–8am)');

  const include = keywordInput('add a must-have keyword…', 'on');
  const exclude = keywordInput('add a keyword to mute…', 'off');

  const advancedBody = el('div', { class: 'adv-body', hidden: true }, [
    el('div', { class: 'adv-grid' }, [
      field('Location', locText),
      field('Radius', radiusSel),
      field('Also include', onlineChk.node, 'Allow virtual events through the filter'),
      field('Opening within', timeSel),
    ]),
    field('Type', types.node),
    field('Sources', sources.node, 'Leave empty to watch every source'),
    el('div', { class: 'adv-field' }, [
      el('label', { class: 'adv-label', text: 'Suppression strictness' }),
      el('div', { class: 'adv-range-row' }, [strictness, strictnessOut]),
      el('span', {
        class: 'adv-hint',
        text: 'The dial that IS the product: loose = Google-Alerts noise, strict = risk missing real updates.',
      }),
    ]),
    el('div', { class: 'adv-grid' }, [
      field('Notify me', freqSel),
      field('Quiet hours', quietChk.node),
    ]),
    el('div', { class: 'adv-grid' }, [
      field('Must include', include.node),
      field('Never include', exclude.node),
    ]),
  ]);

  const advancedToggle = el(
    'button',
    { class: 'adv-toggle', type: 'button' },
    [el('span', { class: 'adv-toggle-caret', text: '▸' }), 'Advanced controls']
  );
  advancedToggle.addEventListener('click', () => {
    const open = !advancedBody.hidden;
    advancedBody.hidden = open;
    advancedToggle.classList.toggle('adv-toggle--open', !open);
  });

  // ---- Spec assembly -----------------------------------------------------
  function buildSpec(query) {
    return {
      query,
      location: {
        text: locText.value.trim(),
        radiusMi: radiusSel.value === 'any' ? null : Number(radiusSel.value),
        onlineOk: onlineChk.get(),
      },
      timeWindow: timeSel.value,
      types: types.get(),
      sources: sources.get(),
      strictness: Number(strictness.value),
      notify: { frequency: freqSel.value, quietHours: quietChk.get() },
      include: include.get(),
      exclude: exclude.get(),
    };
  }

  function commitSearch() {
    const query = input.value.trim();
    if (!query) {
      input.focus();
      input.classList.add('search-input--nudge');
      setTimeout(() => input.classList.remove('search-input--nudge'), 400);
      return;
    }
    onFollow?.({ query, spec: buildSpec(query) });
  }

  const submit = el('button', { class: 'search-go', type: 'button', onClick: commitSearch }, [
    'Watch this',
    el('span', { class: 'search-go-arrow', text: '→' }),
  ]);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitSearch();
  });

  const examples = el(
    'div',
    { class: 'examples' },
    EXAMPLES.map((ex) =>
      el(
        'button',
        {
          class: 'example-card',
          type: 'button',
          onClick: () =>
            onFollow?.({ query: ex.query, watchId: ex.watchId, title: ex.title, spec: buildSpec(ex.query) }),
        },
        [
          el('span', { class: 'example-icon', text: ex.icon }),
          el('span', { class: 'example-title', text: ex.title }),
          el('span', { class: 'example-blurb', text: ex.blurb }),
          el('span', { class: 'example-go', text: 'Watch this →' }),
        ]
      )
    )
  );

  const examplesWrap = el('div', { class: 'examples-wrap reveal' }, [
    el('p', { class: 'examples-label faint', text: 'Or start with something Lookout already watches' }),
    examples,
  ]);

  const scrollCue = el(
    'button',
    {
      class: 'scroll-cue',
      type: 'button',
      onClick: () => examplesWrap.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    ['See what it already watches', el('span', { class: 'cue-arrow', text: '↓' })]
  );

  const node = el('section', { class: 'page page-search', hidden: true }, [
    el('div', { class: 'search-hero' }, [
      el('p', { class: 'eyebrow', text: 'Search' }),
      el('h1', { class: 'hero-title head', text: 'Get alerted only when it matters.' }),
      el('p', {
        class: 'hero-sub',
        text: 'Tell Lookout what to watch. It filters duplicates, stale updates, and off-topic noise — then notifies you only when something new, relevant, and worth acting on appears.',
      }),
      el('div', { class: 'search-bar' }, [input, submit]),
      el('div', { class: 'adv-panel' }, [advancedToggle, advancedBody]),
      scrollCue,
    ]),
    examplesWrap,
  ]);

  return { node, key: 'search', onShow: () => input.focus() };
}

// ---- Small native-control helpers ---------------------------------------
function selectEl(options, value) {
  const sel = el(
    'select',
    { class: 'adv-select' },
    options.map((o) => el('option', { value: o.id }, [o.label]))
  );
  sel.value = value;
  return sel;
}

function checkboxEl(label) {
  const box = el('input', { class: 'adv-check', type: 'checkbox' });
  const node = el('label', { class: 'adv-check-row' }, [box, el('span', { text: label })]);
  return { node, get: () => box.checked };
}
