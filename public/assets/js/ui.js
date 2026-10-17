// Helper condivisi: template HTML con escaping, icone, componenti e animazioni.

class Raw {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new Raw(String(s));

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ESC[c]);

const renderValue = (v) => {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return esc(v);
};

/** Template literal che fa l'escaping di tutti i valori interpolati. */
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < values.length ? renderValue(values[i]) : ''); });
  return new Raw(out);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Icone (tracciati Lucide, licenza ISC) ----------
const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
  quiz: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  checks: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  retry: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
  cap: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  smartphone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
};

export const icon = (name, cls = '') =>
  raw(`<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`);

// ---------- Formattazione ----------
export function formatDuration(sec) {
  if (!sec) return '';
  const m = Math.round(sec / 60);
  return `${m} min`;
}
export function formatClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export const formatDate = (ms) =>
  ms ? new Date(ms).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// ---------- Componenti ----------

/** Anello di avanzamento. Il gradiente #ringGrad è definito una volta sola in app.js. */
export function ring(pct, { size = 120, stroke = 10, label = '', sub = '' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return html`<div class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${`Avanzamento ${Math.round(pct)}%`}">
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-offset="${off}"/>
    </svg>
    <div class="ring-label"><strong>${label}</strong>${sub ? html`<small>${sub}</small>` : ''}</div>
  </div>`;
}

/** Avvia l'animazione degli anelli presenti nella pagina. */
export function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $$('.ring-fill[data-offset]', root).forEach((el) => { el.style.strokeDashoffset = el.dataset.offset; });
  }));
}

let badgeSeq = 0;
/** Illustrazione dell'Open Badge del corso. */
export function badgeArt({ title = 'Salute Orale' } = {}) {
  const id = `bg${++badgeSeq}`;
  return raw(`<svg viewBox="0 0 240 290" role="img" aria-label="Open Badge del corso ${esc(title)}">
    <defs>
      <linearGradient id="${id}a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4ED8"/><stop offset=".55" stop-color="#2563EB"/><stop offset="1" stop-color="#38BDF8"/></linearGradient>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DBEAFE"/><stop offset="1" stop-color="#60A5FA"/></linearGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1E3A8A"/><stop offset="1" stop-color="#0A1A3F"/></linearGradient>
    </defs>
    <path d="M78 196 58 282l30-16 18 22 20-84z" fill="url(#${id}c)"/>
    <path d="M162 196l20 86-30-16-18 22-20-84z" fill="url(#${id}c)"/>
    <polygon points="120,8 214,62 214,170 120,224 26,170 26,62" fill="url(#${id}b)"/>
    <polygon points="120,22 202,69 202,163 120,210 38,163 38,69" fill="url(#${id}a)"/>
    <polygon points="120,22 202,69 202,163 120,210 38,163 38,69" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="2" stroke-dasharray="2 6"/>
    <path d="M97 70c-12 0-19 9-19 22 0 11 4 19 7 28 2 10 4 22 11 22 6 0 7-13 11-21 2-5 5-7 13-7s11 2 13 7c4 8 5 21 11 21 7 0 9-12 11-22 3-9 7-17 7-28 0-13-7-22-19-22-9 0-13 4-23 4s-14-4-23-4z" fill="#fff"/>
    <path d="M150 84c4 3 6 8 6 14" stroke="#BFDBFE" stroke-width="5" stroke-linecap="round" fill="none"/>
    <rect x="52" y="160" width="136" height="30" rx="15" fill="#0A1A3F" fill-opacity=".55"/>
    <text x="120" y="180" text-anchor="middle" font-family="Poppins, sans-serif" font-weight="700" font-size="13" letter-spacing="2" fill="#fff">${esc(title.toUpperCase())}</text>
    <text x="120" y="54" text-anchor="middle" font-family="Poppins, sans-serif" font-weight="600" font-size="10" letter-spacing="3" fill="#DBEAFE">OPEN BADGE</text>
  </svg>`);
}

// ---------- Toast ----------
export function toast(message, type = 'info') {
  const region = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = String(html`${icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info')}<span>${message}</span>`);
  region.append(el);
  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, 4200);
}

// ---------- Animazioni ----------
let revealObserver;
export function observeReveals(root = document) {
  const items = $$('.reveal', root);
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  revealObserver ??= new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        revealObserver.unobserve(e.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el, i) => {
    el.style.transitionDelay = `${(Number(el.dataset.delay) || 0) + (el.dataset.stagger ? (i % 6) * 60 : 0)}ms`;
    revealObserver.observe(el);
  });
}

/** Coriandoli in palette blu per celebrare i traguardi. */
export function confetti(durationMs = 2600) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti';
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const resize = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
  resize();
  const colors = ['#2563EB', '#38BDF8', '#93C5FD', '#1D4ED8', '#67E8F9', '#FFFFFF', '#10B981'];
  const parts = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 14 - 4,
    w: 6 + Math.random() * 6,
    h: 8 + Math.random() * 10,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  (function frame(now) {
    const t = now - start;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - durationMs + 800) / 800);
    for (const p of parts) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.color; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.cos(p.rot * 2));
      ctx.restore();
    }
    if (t < durationMs) requestAnimationFrame(frame);
    else canvas.remove();
  })(start);
}

export const loadingView = () => html`<div class="loading" aria-busy="true"><div class="spinner"></div><span class="sr-only">Caricamento…</span></div>`;

export function errorView(message) {
  return html`<section class="container--narrow prose">
    <div class="alert alert--error">${icon('alert')}<div><strong>Si è verificato un problema.</strong><br>${message}</div></div>
    <p style="margin-top:24px"><a class="btn btn--secondary" href="#/corso">${icon('arrow-left')} Torna al corso</a></p>
  </section>`;
}

export function setButtonLoading(btn, loading, label) {
  if (loading) {
    btn.dataset.label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${esc(label || 'Attendere…')}</span>`;
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}
