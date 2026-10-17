// Effetti di movimento: sfondo "aurora", inclinazione 3D, medaglia 3D trascinabile,
// contatori, luce che segue il puntatore. Tutto si disattiva con "riduci movimento".
import { $$, prefersReducedMotion } from './ui.js';

const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Sfondo animato con macchie di luce blu. Restituisce una funzione di arresto. */
export function aurora(canvas) {
  const ctx = canvas.getContext('2d');
  const blobs = [
    { c: [37, 99, 235], r: 0.55, x: 0.15, y: 0.2, sx: 0.00011, sy: 0.00017, p: 0 },
    { c: [56, 189, 248], r: 0.45, x: 0.85, y: 0.15, sx: 0.00015, sy: 0.00009, p: 2 },
    { c: [99, 102, 241], r: 0.5, x: 0.55, y: 0.95, sx: 0.00008, sy: 0.00013, p: 4 },
    { c: [14, 165, 233], r: 0.35, x: 0.35, y: 0.6, sx: 0.00019, sy: 0.00012, p: 1 },
  ];
  let raf = 0, visible = true, w = 0, h = 0;
  const pointer = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };

  const resize = () => {
    // Bassa risoluzione: le macchie sono sfocate, così costa pochissimo.
    w = canvas.width = Math.max(1, Math.round(canvas.clientWidth / 4));
    h = canvas.height = Math.max(1, Math.round(canvas.clientHeight / 4));
  };
  const draw = (t) => {
    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of blobs) {
      const x = (b.x + Math.sin(t * b.sx + b.p) * 0.12 + (pointer.x - 0.5) * 0.08) * w;
      const y = (b.y + Math.cos(t * b.sy + b.p) * 0.12 + (pointer.y - 0.5) * 0.08) * h;
      const r = b.r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b.c},.55)`);
      g.addColorStop(1, `rgba(${b.c},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };
  const loop = (t) => { draw(t); if (visible) raf = requestAnimationFrame(loop); };

  resize();
  window.addEventListener('resize', resize);
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = (e.clientX - r.left) / r.width;
    pointer.ty = (e.clientY - r.top) / r.height;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  if (prefersReducedMotion()) {
    draw(0);
  } else {
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);
    return () => { io.disconnect(); cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); };
  }
  return () => { window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); };
}

/**
 * Inclinazione 3D di un elemento che segue il puntatore. Sui dispositivi touch
 * l'elemento ondeggia da solo, lentamente.
 */
export function tilt3d(el, { max = 10, area = el } = {}) {
  if (prefersReducedMotion()) return () => {};
  let raf = 0, rx = 0, ry = 0, tx = 0, ty = 0, hovering = false;
  const set = () => {
    rx += (tx - rx) * 0.08;
    ry += (ty - ry) * 0.08;
    el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
  };
  const auto = (t) => {
    if (!hovering) { tx = Math.sin(t / 2600) * max * 0.5; ty = Math.cos(t / 3400) * max * 0.6; }
    set();
    raf = requestAnimationFrame(auto);
  };
  const move = (e) => {
    const r = area.getBoundingClientRect();
    hovering = true;
    ty = ((e.clientX - r.left) / r.width - 0.5) * 2 * max;
    tx = -((e.clientY - r.top) / r.height - 0.5) * 2 * max;
  };
  const leave = () => { hovering = false; };
  if (finePointer()) {
    area.addEventListener('pointermove', move);
    area.addEventListener('pointerleave', leave);
  }
  raf = requestAnimationFrame(auto);
  return () => { cancelAnimationFrame(raf); area.removeEventListener('pointermove', move); area.removeEventListener('pointerleave', leave); };
}

/** Medaglia 3D: gira da sola e si può far ruotare trascinandola, con inerzia. */
export function spinBadge(stage) {
  const coin = stage.querySelector('.coin');
  if (!coin) return () => {};
  const reduce = prefersReducedMotion();
  let angle = -18, velocity = reduce ? 0 : 0.35, dragging = false, lastX = 0, lastT = 0, raf = 0;
  const idle = reduce ? 0 : 0.35;

  const frame = () => {
    if (!dragging) {
      velocity += (idle - velocity) * 0.02;
      angle += velocity;
    }
    coin.style.transform = `rotateX(8deg) rotateY(${angle}deg)`;
    raf = requestAnimationFrame(frame);
  };
  const down = (e) => {
    dragging = true;
    lastX = e.clientX; lastT = performance.now();
    stage.setPointerCapture(e.pointerId);
    stage.classList.add('is-dragging');
  };
  const move = (e) => {
    if (!dragging) return;
    const now = performance.now();
    const dx = e.clientX - lastX;
    angle += dx * 0.6;
    velocity = (dx * 0.6) / Math.max(1, (now - lastT) / 16);
    lastX = e.clientX; lastT = now;
    if (reduce) coin.style.transform = `rotateX(8deg) rotateY(${angle}deg)`;
  };
  const up = () => { dragging = false; stage.classList.remove('is-dragging'); };
  const key = (e) => {
    if (e.key === 'ArrowLeft') { angle -= 30; velocity = -2; }
    if (e.key === 'ArrowRight') { angle += 30; velocity = 2; }
    if (reduce) coin.style.transform = `rotateX(8deg) rotateY(${angle}deg)`;
  };
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('keydown', key);
  if (reduce) coin.style.transform = `rotateX(8deg) rotateY(${angle}deg)`;
  else raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/** Numeri che contano fino al valore in data-count quando entrano nello schermo. */
export function countUp(root = document) {
  const els = $$('[data-count]', root);
  const run = (el) => {
    const target = Number(el.dataset.count);
    const fmt = (n) => `${el.dataset.prefix || ''}${n}${el.dataset.suffix || ''}`;
    if (prefersReducedMotion()) { el.textContent = fmt(target); return; }
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / 1400);
      el.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
  }), { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
}

// ---------- Effetti globali, attivi su tutte le pagine ----------

/** Luce che segue il puntatore sulle schede e leggera inclinazione 3D. */
function initPointerEffects() {
  if (!finePointer() || prefersReducedMotion()) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest?.('[data-glow]');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', `${x * 100}%`);
    card.style.setProperty('--my', `${y * 100}%`);
    if (card.hasAttribute('data-tilt')) {
      card.style.setProperty('--tx', `${((0.5 - y) * 8).toFixed(2)}deg`);
      card.style.setProperty('--ty', `${((x - 0.5) * 8).toFixed(2)}deg`);
    }
  }, { passive: true });
  document.addEventListener('pointerout', (e) => {
    const card = e.target.closest?.('[data-tilt]');
    if (card && !card.contains(e.relatedTarget)) {
      card.style.setProperty('--tx', '0deg');
      card.style.setProperty('--ty', '0deg');
    }
  });
}

/** Barra di avanzamento della lettura sotto l'intestazione. */
function initScrollProgress() {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.querySelector('#site-header')?.append(bar);
  let ticking = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener('hashchange', () => requestAnimationFrame(update));
  update();
}

initPointerEffects();
initScrollProgress();
