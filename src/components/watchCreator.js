import { el, clear } from '../lib/dom.js';

/**
 * Task 2 — Watch creation + spec compile.
 * User types a plain-English condition; on submit we show a "compiling spec…"
 * state, then render the must-match / reject-cases lists once `spec_ready`
 * arrives. `onCreate(queryText)` should call the API; the spec is delivered
 * later via `showSpec()` (driven by the WS message in main.js).
 */
export function WatchCreator({ onCreate }) {
  const input = el('textarea', {
    class: 'watch-input',
    placeholder:
      'alert me when a new in-person ML hackathon opens registration within 100mi of SF…',
    rows: '2',
  });

  const result = el('div', { class: 'spec-result' });

  const submit = async () => {
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    button.disabled = true;
    input.disabled = true;
    showCompiling();
    await onCreate(text);
    // Spec will arrive via showSpec(); re-enable shortly so user can add more.
    setTimeout(() => {
      button.disabled = false;
      input.disabled = false;
    }, 1700);
  };

  const button = el('button', { class: 'btn btn-primary', onClick: submit }, ['compile spec ▸']);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
  });

  function showCompiling() {
    clear(result);
    result.append(
      el('div', { class: 'compiling' }, [
        el('span', { text: 'compiling spec' }),
        el('span', { class: 'bar' }),
      ])
    );
  }

  function showSpec({ must_match = [], reject_cases = [] }, queryText) {
    clear(result);
    const mk = (items, variant, label) =>
      el('div', { class: `spec-group ${variant}` }, [
        el('div', { class: 'spec-label' }, [label]),
        el(
          'ul',
          { class: 'spec-list' },
          items.map((t, i) => {
            const li = el('li', { text: t });
            li.style.animationDelay = `${i * 60}ms`;
            return li;
          })
        ),
      ]);

    const wrap = el('div', { class: 'spec' }, [
      queryText
        ? el('div', { class: 'faint mono', text: `watching: ${queryText}` })
        : null,
      mk(must_match, 'match', '✓ Must match'),
      mk(reject_cases, 'reject', '✕ Reject if'),
    ]);
    result.append(wrap);
  }

  const node = el('section', { class: 'panel' }, [
    el('h2', { class: 'section-title', text: 'Create a watch' }),
    el('div', { class: 'watch-input-row' }, [input, button]),
    result,
  ]);

  return { node, showSpec, showCompiling };
}
