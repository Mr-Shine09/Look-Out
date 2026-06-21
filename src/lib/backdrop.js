/**
 * Floating watercolor orbs — ambient background visualization.
 *
 * Draws a handful of large, soft pastel blobs onto a low-resolution canvas
 * that slowly drift, wander and "breathe" (size + opacity pulse). The canvas
 * is rendered at half resolution and CSS-blurred, so it stays cheap (a few
 * radial-gradient fills per frame) while reading as wet, bleeding watercolor.
 *
 * It sits behind all content (z-index -2), is non-interactive, pauses when the
 * tab is hidden, and renders a single static frame when the user prefers
 * reduced motion. Palette is the Watercolor Calm wash set.
 */

// [r, g, b] from the --wash-* / accent tokens in theme.css.
const WASH = {
  sky: [171, 211, 245],
  blush: [248, 185, 196],
  peach: [251, 211, 166],
  mint: [168, 224, 201],
  lilac: [201, 184, 240],
  corn: [91, 141, 239],
};

// Each orb: home position (fraction of viewport), colour, size + drift params.
const ORBS = [
  { hx: 0.14, hy: 0.12, color: WASH.sky, size: 0.62, alpha: 0.5, drift: 0.06, speed: 0.5, phase: 0 },
  { hx: 0.86, hy: 0.08, color: WASH.blush, size: 0.54, alpha: 0.46, drift: 0.07, speed: 0.62, phase: 1.7 },
  { hx: 0.78, hy: 0.9, color: WASH.lilac, size: 0.6, alpha: 0.44, drift: 0.06, speed: 0.44, phase: 3.1 },
  { hx: 0.2, hy: 0.94, color: WASH.mint, size: 0.56, alpha: 0.42, drift: 0.07, speed: 0.55, phase: 4.4 },
  { hx: 0.52, hy: 0.46, color: WASH.peach, size: 0.5, alpha: 0.34, drift: 0.05, speed: 0.4, phase: 2.2 },
  { hx: 0.45, hy: 0.7, color: WASH.corn, size: 0.4, alpha: 0.16, drift: 0.08, speed: 0.7, phase: 5.6 },
];

const RENDER_SCALE = 0.5; // draw at half res, CSS-blur back up — soft + cheap.

export function mountBackdrop() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const canvas = document.createElement('canvas');
  canvas.className = 'wc-backdrop';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    zIndex: '-2',
    pointerEvents: 'none',
    filter: 'blur(46px) saturate(1.06)',
  });
  document.body.prepend(canvas);

  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;

  function resize() {
    W = Math.max(1, Math.round(window.innerWidth * RENDER_SCALE));
    H = Math.max(1, Math.round(window.innerHeight * RENDER_SCALE));
    canvas.width = W;
    canvas.height = H;
  }

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    const unit = Math.max(W, H);
    for (const o of ORBS) {
      // Slow circular wander around the orb's home position + gentle breathing.
      const a = t * o.speed + o.phase;
      const cx = o.hx * W + Math.cos(a) * o.drift * W;
      const cy = o.hy * H + Math.sin(a * 0.8) * o.drift * H;
      const breathe = 1 + 0.12 * Math.sin(a * 1.3);
      const r = o.size * unit * 0.5 * breathe;
      const alpha = o.alpha * (0.85 + 0.15 * Math.sin(a * 1.3));

      const [cr, cg, cb] = o.color;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(${cr}, ${cg}, ${cb}, ${alpha})`);
      grad.addColorStop(0.55, `rgba(${cr}, ${cg}, ${cb}, ${alpha * 0.4})`);
      grad.addColorStop(1, `rgba(${cr}, ${cg}, ${cb}, 0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });

  if (reduced) {
    draw(0.6); // a single, pleasant static frame
    return;
  }

  let raf = 0;
  let start = 0;
  function frame(now) {
    if (!start) start = now;
    draw((now - start) / 1000); // seconds; orb speeds are tuned slow
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else if (!raf) {
      start = 0;
      raf = requestAnimationFrame(frame);
    }
  });
}
