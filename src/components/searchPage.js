import { el, clear } from '../lib/dom.js';
import { EventStrip } from './eventStrip.js';

/**
 * SEARCH — the front door. One purpose: tell Lookout the exact thing to watch.
 *
 * Just a prompt + the search bar. Once the query compiles, the parsed
 * must-match / reject criteria show up as editable chips so the user can
 * correct anything the parser missed before Lookout starts watching.
 *
 * onFollow({ query, watchId, title }) is called once the user confirms a
 * freshly-compiled watch, or reuses an existing one.
 */

/** Editable keyword-style chip list. Enter adds a chip; click a chip to remove. */
function chipList(initial, accent) {
  const words = [...initial];
  const chips = el('div', { class: 'kw-chips' });
  const input = el('input', {
    class: 'kw-input',
    type: 'text',
    placeholder: 'add…',
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
  return { node: el('div', { class: 'kw-wrap' }, [chips]), get: () => [...words], set: (next) => { words.length = 0; words.push(...next); render(); } };
}

export function SearchPage({ api, onFollow }) {
  const input = el('input', {
    class: 'search-input',
    type: 'text',
    placeholder: 'Tell Lookout exactly what to watch for…',
    autocomplete: 'off',
    spellcheck: 'false',
  });

  const submit = el('button', { class: 'search-go', type: 'button', onClick: () => commitSearch() }, [
    'Watch this',
    el('span', { class: 'search-go-arrow', text: '→' }),
  ]);

  const errorMsg = el('p', { class: 'search-error', hidden: true });

  // ---- Compiling / spec-confirm state ------------------------------------
  const compiling = el('div', { class: 'compiling', hidden: true }, [
    el('span', { text: 'Compiling spec' }),
    el('span', { class: 'bar' }),
  ]);

  let pendingWatchId = null;
  let pendingQuery = '';
  let mustMatch = null;
  let rejectCases = null;
  const specPanel = el('div', { class: 'spec-confirm', hidden: true });

  function resetToBlank() {
    pendingWatchId = null;
    pendingQuery = '';
    mustMatch = null;
    rejectCases = null;
    compiling.hidden = true;
    specPanel.hidden = true;
    clear(specPanel);
    input.disabled = false;
    submit.disabled = false;
    input.value = '';
    input.focus();
  }

  function renderSpecPanel() {
    clear(specPanel);
    const must = chipList(mustMatch, 'on');
    const reject = chipList(rejectCases, 'off');
    const confirmBtn = el('button', { class: 'primary-btn', type: 'button' }, ['Looks good — start watching →']);
    const cancelBtn = el('button', { class: 'ghost-btn', type: 'button' }, ['Cancel']);
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      cancelBtn.disabled = true;
      try {
        await api.updateSpec?.(pendingWatchId, { must_match: must.get(), reject_cases: reject.get() });
        const confirmed = { query: pendingQuery, watchId: pendingWatchId, title: pendingQuery };
        resetToBlank();
        onFollow?.(confirmed);
      } catch (err) {
        console.error('[search] updateSpec failed', err);
        errorMsg.textContent = 'Could not save your edits — try again.';
        errorMsg.hidden = false;
        confirmBtn.disabled = false;
        cancelBtn.disabled = false;
      }
    });
    cancelBtn.addEventListener('click', async () => {
      cancelBtn.disabled = true;
      try {
        await api.deleteWatch?.(pendingWatchId);
      } catch (err) {
        console.warn('[search] cancel delete failed', err);
      }
      resetToBlank();
    });
    specPanel.append(
      el('p', { class: 'spec-confirm-label faint', text: `Lookout parsed “${pendingQuery}” as:` }),
      el('div', { class: 'adv-grid' }, [
        el('div', { class: 'adv-field' }, [el('label', { class: 'adv-label', text: '✓ Must match' }), must.node]),
        el('div', { class: 'adv-field' }, [el('label', { class: 'adv-label', text: '✕ Reject if' }), reject.node]),
      ]),
      el('div', { class: 'spec-confirm-actions' }, [cancelBtn, confirmBtn])
    );
    specPanel.hidden = false;
  }

  // Enter-in-input and the button click can both fire in the same gesture
  // (press Enter, then reflexively click "Watch this" before the page has
  // navigated away) — guard so a single submit never creates two watches.
  let lastSubmitAt = 0;
  async function commitSearch() {
    const query = input.value.trim();
    if (!query) {
      input.focus();
      input.classList.add('search-input--nudge');
      setTimeout(() => input.classList.remove('search-input--nudge'), 400);
      return;
    }
    const now = Date.now();
    if (now - lastSubmitAt < 1500) return;
    lastSubmitAt = now;

    errorMsg.hidden = true;
    input.disabled = true;
    submit.disabled = true;
    compiling.hidden = false;
    try {
      const { watch_id } = await api.createWatch(query);
      pendingWatchId = watch_id;
      pendingQuery = query;
    } catch (err) {
      console.error('[search] createWatch failed', err);
      compiling.hidden = true;
      input.disabled = false;
      submit.disabled = false;
      errorMsg.textContent = String(err?.message || err).replace(/^\d+(\s\w+)?:\s*/, '');
      errorMsg.hidden = false;
    }
  }

  // Called from main.js when the compiled spec arrives over the WS/PATCH.
  function handleSpecReady(msg) {
    if (!pendingWatchId || msg.watch_id !== pendingWatchId) return;
    mustMatch = msg.must_match || [];
    rejectCases = msg.reject_cases || [];
    compiling.hidden = true;
    renderSpecPanel();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') commitSearch();
  });

  const strip = api ? EventStrip({ api }) : null;

  const node = el('section', { class: 'page page-search', hidden: true }, [
    el('div', { class: 'search-hero' }, [
      el('p', { class: 'eyebrow', text: 'Search' }),
      el('h1', { class: 'hero-title head', text: 'The silence is the point.' }),
      el('p', {
        class: 'hero-sub',
        text: 'Type what you want to watch. Lookout remembers what it has already shown you, so reworded duplicates and stale noise collapse into silence.',
      }),
      el('div', { class: 'search-bar' }, [input, submit]),
      errorMsg,
      compiling,
      specPanel,
    ]),
    strip ? strip.node : null,
  ]);

  return {
    node,
    key: 'search',
    onShow: () => { if (!pendingWatchId) input.focus(); },
    handleSpecReady,
    reset: resetToBlank,
  };
}
