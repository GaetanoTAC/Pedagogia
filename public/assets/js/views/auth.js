import { html, icon, $, $$, setButtonLoading, badgeArt } from '../ui.js';
import { api } from '../api.js';

const field = ({ name, label, type = 'text', autocomplete, hint, inputmode }) => html`
  <div class="field" data-field="${name}">
    <label for="f-${name}">${label}</label>
    ${type === 'password'
      ? html`<div class="input-wrap">
          <input class="input" id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required aria-describedby="e-${name}${hint ? ` h-${name}` : ''}">
          <button type="button" class="toggle-pass" aria-label="Mostra password" aria-pressed="false">${icon('eye')}</button>
        </div>`
      : html`<input class="input" id="f-${name}" name="${name}" type="${type}" autocomplete="${autocomplete}" ${inputmode ? html`inputmode="${inputmode}"` : ''} required aria-describedby="e-${name}${hint ? ` h-${name}` : ''}">`}
    ${hint ? html`<span class="hint" id="h-${name}">${hint}</span>` : ''}
    <span class="field-error" id="e-${name}" role="alert"></span>
  </div>`;

const side = (title, text) => html`
  <aside class="auth-side">
    <div class="orb orb--1"></div><div class="orb orb--3"></div>
    <div style="max-width:440px">
      <div style="width:150px;margin-bottom:32px">${badgeArt()}</div>
      <h2>${title}</h2>
      <p style="font-size:1.08rem">${text}</p>
      <ul class="feature-list">
        <li><span class="fi">${icon('play')}</span><div><strong>10 videolezioni</strong><span>Brevi, chiare, da seguire quando vuoi.</span></div></li>
        <li><span class="fi">${icon('checks')}</span><div><strong>Progressi salvati</strong><span>Riprendi esattamente da dove eri rimasto.</span></div></li>
        <li><span class="fi">${icon('award')}</span><div><strong>Open Badge finale</strong><span>Un attestato digitale per il tuo CV.</span></div></li>
      </ul>
    </div>
  </aside>`;

function bindPasswordToggles(root) {
  $$('.toggle-pass', root).forEach((btn) => btn.addEventListener('click', () => {
    const input = btn.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Nascondi password' : 'Mostra password');
    btn.innerHTML = String(icon(show ? 'eye-off' : 'eye'));
  }));
}

function showErrors(form, fields = {}) {
  $$('.field', form).forEach((f) => {
    const msg = fields[f.dataset.field];
    f.classList.toggle('has-error', Boolean(msg));
    $('.field-error', f).textContent = msg || '';
    $('.input', f)?.setAttribute('aria-invalid', msg ? 'true' : 'false');
  });
  const first = Object.keys(fields)[0];
  if (first) form.querySelector(`[name="${first}"]`)?.focus();
}

function setFormAlert(form, message) {
  const box = $('.form-alert', form);
  box.hidden = !message;
  box.innerHTML = message ? String(html`<div class="alert alert--error">${icon('alert')}<span>${message}</span></div>`) : '';
}

export function loginView({ onAuth }) {
  const view = html`
  <div class="auth-wrap">
    ${side('Bentornato!', 'Accedi per riprendere il tuo percorso sulla salute orale.')}
    <div class="auth-main">
      <div class="auth-card">
        <h1>Accedi</h1>
        <p class="lead">Usa l'email istituzionale con cui ti sei registrato.</p>
        <form class="form" novalidate>
          <div class="form-alert" hidden></div>
          ${field({ name: 'email', label: 'Email istituzionale', type: 'email', autocomplete: 'email' })}
          ${field({ name: 'password', label: 'Password', type: 'password', autocomplete: 'current-password' })}
          <button class="btn btn--primary btn--lg btn--block" type="submit">Accedi ${icon('arrow-right')}</button>
        </form>
        <p class="auth-switch">Non hai un account? <a href="#/registrati">Registrati</a></p>
      </div>
    </div>
  </div>`;

  return {
    view,
    mount(root) {
      const form = $('form', root);
      bindPasswordToggles(root);
      $('#f-email', root).focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        const fields = {};
        if (!data.email) fields.email = 'Inserisci la tua email.';
        if (!data.password) fields.password = 'Inserisci la password.';
        showErrors(form, fields);
        setFormAlert(form, '');
        if (Object.keys(fields).length) return;
        const btn = $('button[type=submit]', form);
        setButtonLoading(btn, true, 'Accesso in corso…');
        try {
          const { user } = await api('/auth/login', { method: 'POST', body: data });
          onAuth(user, '#/corso');
        } catch (err) {
          setFormAlert(form, err.message);
          setButtonLoading(btn, false);
        }
      });
    },
  };
}

export function registerView({ onAuth, config }) {
  const domain = config.emailDomain;
  const view = html`
  <div class="auth-wrap">
    ${side('Inizia il tuo percorso', 'Crea il tuo account in meno di un minuto e guarda subito la prima lezione.')}
    <div class="auth-main">
      <div class="auth-card">
        <h1>Crea il tuo account</h1>
        <p class="lead">I dati servono all'Università per rilasciarti l'Open Badge.</p>
        <form class="form" novalidate>
          <div class="form-alert" hidden></div>
          <div class="form-row">
            ${field({ name: 'firstName', label: 'Nome', autocomplete: 'given-name' })}
            ${field({ name: 'lastName', label: 'Cognome', autocomplete: 'family-name' })}
          </div>
          ${field({ name: 'email', label: 'Email istituzionale', type: 'email', autocomplete: 'email', hint: `Es. nome.cognome@${domain}` })}
          ${field({ name: 'matricola', label: 'Numero di matricola', autocomplete: 'off', inputmode: 'numeric' })}
          ${field({ name: 'password', label: 'Password', type: 'password', autocomplete: 'new-password', hint: 'Almeno 8 caratteri.' })}
          <div class="field" data-field="consent">
            <label class="check" for="f-consent">
              <input type="checkbox" id="f-consent" name="consent" value="1" aria-describedby="e-consent">
              <span>Acconsento al trattamento dei miei dati per la partecipazione al corso e il rilascio dell'Open Badge, come descritto nell'<a href="#/privacy" target="_blank" rel="noopener">informativa privacy</a>.</span>
            </label>
            <span class="field-error" id="e-consent" role="alert"></span>
          </div>
          <button class="btn btn--primary btn--lg btn--block" type="submit">Crea account e inizia ${icon('arrow-right')}</button>
        </form>
        <p class="auth-switch">Hai già un account? <a href="#/accedi">Accedi</a></p>
      </div>
    </div>
  </div>`;

  return {
    view,
    mount(root) {
      const form = $('form', root);
      bindPasswordToggles(root);
      $('#f-firstName', root).focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        data.consent = Boolean(data.consent);
        const fields = {};
        if (!data.firstName?.trim()) fields.firstName = 'Inserisci il nome.';
        if (!data.lastName?.trim()) fields.lastName = 'Inserisci il cognome.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || '')) fields.email = 'Inserisci un indirizzo email valido.';
        if (!data.matricola?.trim()) fields.matricola = 'Inserisci il numero di matricola.';
        if ((data.password || '').length < 8) fields.password = 'La password deve avere almeno 8 caratteri.';
        if (!data.consent) fields.consent = 'Serve il consenso per partecipare al corso.';
        showErrors(form, fields);
        setFormAlert(form, '');
        if (Object.keys(fields).length) return;
        const btn = $('button[type=submit]', form);
        setButtonLoading(btn, true, 'Creazione account…');
        try {
          const { user } = await api('/auth/register', { method: 'POST', body: data });
          onAuth(user, '#/corso', `Benvenuto, ${user.firstName}! Il tuo percorso inizia qui.`);
        } catch (err) {
          showErrors(form, err.fields);
          setFormAlert(form, err.message);
          setButtonLoading(btn, false);
        }
      });
    },
  };
}
