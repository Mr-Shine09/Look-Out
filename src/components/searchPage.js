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

// Filter groups. Each selected option is appended to the query so it both
// refines the spec and narrows what the backend will surface.
const FILTERS = [
  {
    key: 'where',
    label: 'Where',
    options: [
      { id: 'near', text: 'Near me', hint: 'in-person, within ~100mi of SF', default: true },
      { id: 'online', text: 'Online', hint: 'virtual is fine' },
    ],
  },
  {
    key: 'when',
    label: 'When',
    options: [
      { id: 'soon', text: 'Opening soon', hint: 'registration/deadline still open', default: true },
    ],
  },
  {
    key: 'type',
    label: 'Type',
    options: [
      { id: 'events', text: 'Events' },
      { id: 'funding', text: 'Funding' },
      { id: 'hackathons', text: 'Hackathons' },
    ],
  },
];

export function SearchPage({ onFollow }) {
  const selected = new Set(
    FILTERS.flatMap((g) => g.options.filter((o) => o.default).map((o) => `${g.key}:${o.id}`))
  );

  const input = el('input', {
    class: 'search-input',
    type: 'text',
    placeholder: 'Tell Lookout exactly what to watch for…',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const filtersRow = el('div', { class: 'filters' });
  function renderFilters() {
    clear(filtersRow);
    for (const group of FILTERS) {
      const chips = group.options.map((opt) => {
        const token = `${group.key}:${opt.id}`;
        const on = selected.has(token);
        const chip = el(
          'button',
          {
            class: `chip ${on ? 'chip--on' : ''}`,
            type: 'button',
            title: opt.hint || '',
            onClick: () => {
              if (selected.has(token)) selected.delete(token);
              else selected.add(token);
              renderFilters();
            },
          },
          [el('span', { class: 'chip-check', text: on ? '✓' : '+' }), el('span', { text: opt.text })]
        );
        return chip;
      });
      filtersRow.append(
        el('div', { class: 'filter-group' }, [
          el('span', { class: 'filter-label', text: group.label }),
          el('div', { class: 'filter-chips' }, chips),
        ])
      );
    }
  }
  renderFilters();

  function activeFilters() {
    return [...selected];
  }

  function commitSearch() {
    const query = input.value.trim();
    if (!query) {
      input.focus();
      input.classList.add('search-input--nudge');
      setTimeout(() => input.classList.remove('search-input--nudge'), 400);
      return;
    }
    onFollow?.({ query, filters: activeFilters() });
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
            onFollow?.({ query: ex.query, watchId: ex.watchId, title: ex.title, filters: activeFilters() }),
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

  const node = el('section', { class: 'page page-search', hidden: true }, [
    el('div', { class: 'search-hero' }, [
      el('p', { class: 'eyebrow', text: 'Search' }),
      el('h1', { class: 'hero-title head', text: 'Tell Lookout what to watch.' }),
      el('p', {
        class: 'hero-sub',
        text: 'Every other alert tool is built to ping you more. Lookout only speaks up when something is genuinely new and genuinely matters.',
      }),
      el('div', { class: 'search-bar' }, [input, submit]),
      filtersRow,
    ]),
    el('div', { class: 'examples-wrap' }, [
      el('p', { class: 'examples-label faint', text: 'Or start with something Lookout already watches' }),
      examples,
    ]),
  ]);

  return { node, key: 'search', onShow: () => input.focus() };
}
