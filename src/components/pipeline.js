import { el } from '../lib/dom.js';

const STAGES = [
  { key: 'scout', label: 'Scout' },
  { key: 'judge', label: 'Judge' },
  { key: 'strategist', label: 'Strategist' },
  { key: 'drafter', label: 'Drafter' },
  { key: 'critic', label: 'Critic' },
];

/**
 * Task 6 (optional V3) — five-stage agent pipeline tracker. Stages light up
 * idle -> running -> done as `pipeline_stage` messages arrive, each revealing a
 * short output snippet. Driven externally by the API's triggerPipeline().
 */
export function Pipeline() {
  const stageEls = new Map();

  const row = el(
    'div',
    { class: 'pipeline' },
    STAGES.map((s, i) => {
      const snip = el('div', { class: 'pstage-snip', text: '' });
      const stage = el('div', { class: 'pstage', dataset: { key: s.key } }, [
        el('span', { class: 'pstage-state' }),
        el('div', { class: 'pstage-num', text: `0${i + 1}` }),
        el('div', { class: 'pstage-name', text: s.label }),
        snip,
      ]);
      stageEls.set(s.key, { stage, snip });
      return stage;
    })
  );

  function reset() {
    for (const { stage, snip } of stageEls.values()) {
      stage.classList.remove('running', 'done');
      snip.textContent = '';
    }
  }

  function update({ stage, status, output_snippet }) {
    const entry = stageEls.get(stage);
    if (!entry) return;
    entry.stage.classList.remove('running', 'done');
    entry.stage.classList.add(status === 'done' ? 'done' : 'running');
    if (output_snippet) entry.snip.textContent = output_snippet;
  }

  const node = el('section', { class: 'panel' }, [
    el('h2', { class: 'section-title', text: 'Action pipeline — pick a match, watch it act' }),
    row,
    el('div', {
      class: 'faint mono',
      style: 'margin-top:10px;font-size:11px',
      text: '⚡ click "act" on any match to run scout → judge → strategist → drafter → critic',
    }),
  ]);

  return { node, update, reset };
}
