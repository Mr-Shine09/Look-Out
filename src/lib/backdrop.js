/**
 * Procedural watercolor landscape — ambient background visualization.
 *
 * An original Refero/Duna-inspired treatment: peach sky washes, soft distant
 * hills, a quiet lake/meadow horizon and a paper fade behind the product UI.
 * The canvas renders at reduced resolution and gently blurs/saturates in CSS,
 * so the result feels painted rather than vector-sharp.
 *
 * It sits behind all content (z-index -2), is non-interactive, pauses when the
 * tab is hidden, and renders a single static frame when the user prefers
 * reduced motion. Palette is the Watercolor Calm wash set.
 */

const WASH = {
  sky: [171, 211, 245],
  blush: [248, 185, 196],
  peach: [251, 211, 166],
  mint: [168, 224, 201],
  lilac: [201, 184, 240],
  corn: [91, 141, 239],
  meadow: [158, 188, 98],
  ink: [42, 45, 52],
  paper: [251, 248, 242],
};

const HILLS = [
  { y: 0.36, h: 0.16, color: WASH.lilac, alpha: 0.24, speed: 0.08, phase: 0.2 },
  { y: 0.42, h: 0.18, color: WASH.sky, alpha: 0.26, speed: 0.11, phase: 1.4 },
  { y: 0.49, h: 0.2, color: WASH.mint, alpha: 0.3, speed: 0.13, phase: 2.5 },
  { y: 0.56, h: 0.16, color: WASH.meadow, alpha: 0.26, speed: 0.17, phase: 3.4 },
];

const RENDER_SCALE = 0.62;

function rgba(color, alpha) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function radial(ctx, x, y, r, color, alpha, stop = 0.58) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(stop, rgba(color, alpha * 0.42));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function hillPath(ctx, W, H, layer, drift) {
  const base = H * layer.y;
  const amp = H * layer.h;
  ctx.beginPath();
  ctx.moveTo(-W * 0.08, H * 0.82);
  ctx.lineTo(-W * 0.08, base + amp * 0.55);
  ctx.bezierCurveTo(W * 0.12 + drift, base - amp * 0.45, W * 0.22 + drift, base + amp * 0.12, W * 0.34 + drift, base - amp * 0.58);
  ctx.bezierCurveTo(W * 0.48 + drift, base - amp * 1.12, W * 0.52 + drift, base + amp * 0.12, W * 0.66 + drift, base - amp * 0.5);
  ctx.bezierCurveTo(W * 0.8 + drift, base - amp * 0.95, W * 0.9 + drift, base + amp * 0.08, W * 1.08 + drift, base - amp * 0.34);
  ctx.lineTo(W * 1.08, H * 0.84);
  ctx.closePath();
}

function fillHill(ctx, W, H, layer, t) {
  const drift = Math.sin(t * layer.speed + layer.phase) * W * 0.018;
  for (let i = 0; i < 3; i += 1) {
    ctx.save();
    ctx.translate(Math.sin(t * 0.07 + i + layer.phase) * W * 0.006, i * H * 0.006);
    hillPath(ctx, W, H, layer, drift);
    ctx.fillStyle = rgba(layer.color, layer.alpha * (0.58 - i * 0.1));
    ctx.fill();
    ctx.restore();
  }
}

function drawLake(ctx, W, H, t) {
  const y = H * 0.62;
  const g = ctx.createLinearGradient(0, y - H * 0.05, 0, H * 0.88);
  g.addColorStop(0, rgba(WASH.sky, 0.24));
  g.addColorStop(0.48, rgba(WASH.blush, 0.22));
  g.addColorStop(1, rgba(WASH.paper, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(W * 0.06, y + H * 0.1);
  ctx.bezierCurveTo(W * 0.25, y - H * 0.03, W * 0.42, y - H * 0.04, W * 0.58, y + H * 0.02);
  ctx.bezierCurveTo(W * 0.72, y + H * 0.08, W * 0.86, y + H * 0.02, W * 1.02, y - H * 0.04);
  ctx.lineTo(W * 1.02, H * 0.92);
  ctx.bezierCurveTo(W * 0.78, H * 0.88, W * 0.48, H * 0.88, W * 0.04, H * 0.94);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = rgba(WASH.corn, 0.08);
  ctx.lineWidth = Math.max(1, H * 0.002);
  for (let i = 0; i < 7; i += 1) {
    const yy = y + H * (0.025 + i * 0.03) + Math.sin(t * 0.25 + i) * H * 0.003;
    ctx.beginPath();
    ctx.moveTo(W * (0.18 + i * 0.02), yy);
    ctx.bezierCurveTo(W * 0.36, yy + H * 0.01, W * 0.58, yy - H * 0.01, W * (0.82 - i * 0.018), yy + H * 0.004);
    ctx.stroke();
  }
}

function drawMeadow(ctx, W, H, t) {
  const y = H * 0.62;
  radial(ctx, W * 0.18 + Math.sin(t * 0.08) * W * 0.02, y + H * 0.05, W * 0.42, WASH.meadow, 0.18, 0.62);
  radial(ctx, W * 0.77 + Math.cos(t * 0.1) * W * 0.018, y + H * 0.04, W * 0.38, WASH.peach, 0.18, 0.64);
  radial(ctx, W * 0.5, y + H * 0.07, W * 0.34, WASH.blush, 0.13, 0.55);
}

function drawSky(ctx, W, H, t) {
  ctx.fillStyle = rgba(WASH.paper, 1);
  ctx.fillRect(0, 0, W, H);
  radial(ctx, W * (0.2 + Math.sin(t * 0.07) * 0.02), H * 0.08, W * 0.44, WASH.peach, 0.38);
  radial(ctx, W * (0.72 + Math.cos(t * 0.06) * 0.02), H * 0.08, W * 0.42, WASH.blush, 0.32);
  radial(ctx, W * (0.54 + Math.sin(t * 0.04) * 0.03), H * 0.22, W * 0.36, WASH.sky, 0.2);
  radial(ctx, W * 0.46, H * 0.06, W * 0.32, WASH.peach, 0.22);
}

function drawPaperFade(ctx, W, H) {
  const g = ctx.createLinearGradient(0, H * 0.58, 0, H);
  g.addColorStop(0, rgba(WASH.paper, 0));
  g.addColorStop(0.48, rgba(WASH.paper, 0.78));
  g.addColorStop(1, rgba(WASH.paper, 0.98));
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.56, W, H * 0.44);
}

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
    filter: 'blur(10px) saturate(1.09)',
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
    drawSky(ctx, W, H, t);
    for (const layer of HILLS) fillHill(ctx, W, H, layer, t);
    drawLake(ctx, W, H, t);
    drawMeadow(ctx, W, H, t);
    drawPaperFade(ctx, W, H);
  }

  resize();
  window.addEventListener('resize', () => {
    resize();
    if (reduced) draw(0.6);
  }, { passive: true });

  if (reduced) {
    draw(0.6);
    return;
  }

  let raf = 0;
  let start = 0;
  function frame(now) {
    if (!start) start = now;
    draw((now - start) / 1000);
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
