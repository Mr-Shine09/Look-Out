import { el, svgEl, clear } from '../lib/dom.js';

/**
 * Task 5 — the precision curve: false-alarm rate over the session, trending
 * down as the model learns. Hand-rolled SVG (no charting lib), built bold and
 * simple so it reads from a few feet away on a projector.
 */
const VB_W = 600;
const VB_H = 180;
const PAD = { top: 16, right: 16, bottom: 26, left: 40 };

export function PrecisionCurve() {
  let points = []; // [{ timestamp, false_alarm_rate }]

  const valEl = el('span', { class: 'val', text: '—' });
  const trendEl = el('span', { class: 'trend', text: '' });

  const svg = svgEl('svg', {
    class: 'curve-svg',
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    preserveAspectRatio: 'none',
  });

  // Gradient def for the area fill.
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'curveGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.append(svgEl('stop', { offset: '0%', 'stop-color': '#34d9c8', 'stop-opacity': '0.28' }));
  grad.append(svgEl('stop', { offset: '100%', 'stop-color': '#34d9c8', 'stop-opacity': '0' }));
  defs.append(grad);
  svg.append(defs);

  const plot = svgEl('g');
  svg.append(plot);

  function yMax() {
    const maxRate = points.reduce((m, p) => Math.max(m, p.false_alarm_rate), 0.1);
    return Math.max(0.4, maxRate * 1.1);
  }

  function scaleX(i, n) {
    if (n <= 1) return PAD.left;
    return PAD.left + (i / (n - 1)) * (VB_W - PAD.left - PAD.right);
  }
  function scaleY(rate) {
    const h = VB_H - PAD.top - PAD.bottom;
    return PAD.top + (1 - rate / yMax()) * h;
  }

  function render() {
    clear(plot);
    const n = points.length;

    // Horizontal grid lines + y labels (as % false-alarm).
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const rate = (yMax() / ticks) * t;
      const y = scaleY(rate);
      plot.append(svgEl('line', { class: 'grid-line', x1: PAD.left, y1: y, x2: VB_W - PAD.right, y2: y }));
      const lbl = svgEl('text', { class: 'axis-label', x: 6, y: y + 3 });
      lbl.textContent = `${Math.round(rate * 100)}%`;
      plot.append(lbl);
    }

    if (n === 0) {
      const t = svgEl('text', { class: 'axis-label', x: VB_W / 2 - 60, y: VB_H / 2 });
      t.textContent = 'awaiting first signal…';
      plot.append(t);
      return;
    }

    const coords = points.map((p, i) => [scaleX(i, n), scaleY(p.false_alarm_rate)]);
    const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

    // Area under the line.
    const baseY = scaleY(0);
    const areaPath =
      `M${coords[0][0].toFixed(1)},${baseY.toFixed(1)} ` +
      coords.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ') +
      ` L${coords[n - 1][0].toFixed(1)},${baseY.toFixed(1)} Z`;

    plot.append(svgEl('path', { class: 'curve-area', d: areaPath }));
    plot.append(svgEl('path', { class: 'curve-line', d: linePath }));

    coords.forEach(([x, y], i) => {
      const isHead = i === n - 1;
      plot.append(svgEl('circle', { class: `curve-dot ${isHead ? 'head' : ''}`, cx: x, cy: y, r: isHead ? 4 : 2.2 }));
    });

    // Readout.
    const cur = points[n - 1].false_alarm_rate;
    valEl.textContent = `${Math.round(cur * 100)}%`;
    if (n > 1) {
      const first = points[0].false_alarm_rate;
      const drop = Math.round((first - cur) * 100);
      trendEl.textContent = drop > 0 ? `▼ ${drop}pts this session` : '';
    }
  }

  function setPoints(pts) {
    points = [...pts];
    render();
  }
  function addPoint(p) {
    points.push(p);
    render();
  }

  render();

  const node = el('section', { class: 'panel curve-card' }, [
    el('div', { class: 'curve-head' }, [
      el('h2', { class: 'section-title', text: 'Precision curve — false-alarm rate' }),
      el('div', { class: 'curve-current' }, [valEl, trendEl]),
    ]),
    svg,
  ]);

  return { node, setPoints, addPoint };
}
