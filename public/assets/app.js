import { html, icon, $, toast, loadingView, errorView } from './js/ui.js';
import { api } from './js/api.js';
import { landingView } from './js/views/landing.js';
import { loginView, registerView } from './js/views/auth.js';
import { dashboardView } from './js/views/dashboard.js';
import { lessonView } from './js/views/lesson.js';
import { quizView } from './js/views/quiz.js';
import { adminView } from './js/views/admin.js';
import { completeView, privacyView, notFoundView } from './js/views/pages.js';

const state = { user: null, config: { emailDomain: 'studenti.unimi.it' } };
const main = $('#main');
const header = $('#site-header');
let cleanup = null;
let renderSeq = 0;

// Gradiente condiviso dagli anelli di avanzamento.
document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4DB8E2"/><stop offset="1" stop-color="#0A6BC2"/></linearGradient></defs></svg>`);

const LANDING_SECTIONS = { programma: 'programma', faq: 'faq', 'come-funziona': 'come-funziona' };

const routes = [
  { path: /^\/?$/, view: landingView, name: 'home' },
  { path: /^\/(programma|faq|come-funziona)$/, view: landingView, name: 'home', section: (m) => LANDING_SECTIONS[m[1]] },
  { path: /^\/accedi$/, view: loginView, name: 'login', guest: true },
  { path: /^\/registrati$/, view: registerView, name: 'register', guest: true },
  { path: /^\/corso$/, view: dashboardView, name: 'course', auth: true },
  { path: /^\/lezione\/(\d+)$/, view: lessonView, name: 'course', auth: true, params: (m) => ({ pos: m[1] }) },
  { path: /^\/lezione\/(\d+)\/quiz$/, view: quizView, name: 'course', auth: true, params: (m) => ({ pos: m[1] }) },
  { path: /^\/completato$/, view: completeView, name: 'course', auth: true },
  { path: /^\/admin$/, view: adminView, name: 'admin', admin: true },
  { path: /^\/privacy$/, view: privacyView, name: 'privacy' },
];

function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function renderNav(active) {
  const u = state.user;
  const link = (href, label, name, extra = '') =>
    html`<a class="nav-link ${extra}" href="${href}" ${active === name ? html`aria-current="page"` : ''}>${label}</a>`;
  $('#main-nav').innerHTML = String(u
    ? html`
      ${link('#/corso', html`${icon('book')}<span class="hide-sm">Il mio corso</span>`, 'course')}
      ${u.isAdmin ? link('#/admin', html`${icon('sliders')}<span class="hide-sm">Gestione</span>`, 'admin') : ''}
      <span class="nav-sep hide-sm" aria-hidden="true"></span>
      <span class="user-chip hide-sm"><span class="avatar" aria-hidden="true">${(u.firstName[0] || '') + (u.lastName[0] || '')}</span>${u.firstName}</span>
      <button class="nav-link" type="button" data-logout style="border:0;background:none;cursor:pointer">${icon('logout')}<span class="sr-only">Esci</span></button>`
    : html`
      ${link('#/programma', 'Programma', 'program', 'hide-sm')}
      ${link('#/faq', 'FAQ', 'faq', 'hide-sm')}
      ${link('#/accedi', 'Accedi', 'login')}
      <a class="btn btn--primary btn--sm" href="#/registrati">Inizia</a>`);
  $('[data-logout]')?.addEventListener('click', async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    toast('Sei uscito dal tuo account.');
    navigate('#/');
  });
}

function onAuth(user, target, message) {
  state.user = user;
  if (message) toast(message, 'success');
  navigate(target);
}

async function render() {
  const seq = ++renderSeq;
  const path = location.hash.replace(/^#/, '') || '/';
  let match = null;
  const route = routes.find((r) => (match = path.match(r.path)));

  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  if (route?.auth && !state.user) return navigate('#/accedi');
  if (route?.admin && !state.user?.isAdmin) return navigate(state.user ? '#/corso' : '#/accedi');
  if (route?.guest && state.user) return navigate('#/corso');

  renderNav(route?.name);
  header.classList.remove('is-dark');
  main.innerHTML = String(loadingView());

  let page;
  try {
    const ctx = {
      user: state.user,
      config: state.config,
      params: route?.params?.(match) || {},
      section: route?.section?.(match),
      onAuth,
      navigate,
    };
    page = route ? await route.view(ctx) : notFoundView();
  } catch (err) {
    if (seq !== renderSeq) return;
    if (err.status === 401) { state.user = null; return navigate('#/accedi'); }
    if (err.status === 403) toast(err.message, 'error');
    page = { view: errorView(err.message) };
  }
  if (seq !== renderSeq) return; // nel frattempo l'utente ha cambiato pagina

  header.classList.toggle('is-dark', Boolean(page.dark));
  main.innerHTML = String(page.view);
  if (!route?.section) window.scrollTo({ top: 0, behavior: 'instant' });
  cleanup = page.mount?.(main) || null;
  if (!route?.section) main.focus({ preventScroll: true });
  document.title = `${titleFor(route)}Smile Up`;
}

function titleFor(route) {
  const names = { login: 'Accedi', register: 'Registrati', course: 'Il mio corso', admin: 'Gestione', privacy: 'Privacy' };
  return route && names[route.name] ? `${names[route.name]} · ` : '';
}

window.addEventListener('scroll', () => header.classList.toggle('is-scrolled', window.scrollY > 8), { passive: true });
window.addEventListener('hashchange', render);

(async function init() {
  try {
    const me = await api('/me');
    state.user = me.user;
    if (me.config) state.config = me.config;
  } catch { /* si prosegue come ospite */ }
  render();
})();
