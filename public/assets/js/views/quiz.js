import { html, icon, $, $$, ring, animateRings, confetti, setButtonLoading, toast } from '../ui.js';
import { api } from '../api.js';

const KEYS = 'ABCDEF';

export async function quizView({ params, navigate }) {
  const pos = Number(params.pos);
  const [{ lesson, passThreshold, questions }, { total }] = await Promise.all([
    api(`/lessons/${pos}/quiz`),
    api(`/lessons/${pos}`),
  ]);
  const answers = new Array(questions.length).fill(null);
  let step = 0;

  const shell = html`
  <div class="container--narrow quiz-wrap">
    <nav class="crumbs" aria-label="Percorso">
      <a href="#/lezione/${pos}">${icon('arrow-left')} Lezione ${pos}</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Quiz</span>
    </nav>
    <section class="card quiz-card" id="quiz" aria-live="polite"></section>
  </div>`;

  function renderQuestion(root) {
    const q = questions[step];
    const last = step === questions.length - 1;
    $('#quiz', root).innerHTML = String(html`
      <div class="quiz-top">
        <span class="eyebrow" style="margin:0">${lesson.title}</span>
        <div class="quiz-dots" aria-hidden="true">
          ${questions.map((_, i) => html`<span class="${i < step ? 'is-done' : i === step ? 'is-current' : ''}"></span>`)}
        </div>
      </div>
      <p style="color:var(--text-muted);font-weight:600;margin-bottom:8px">Domanda ${step + 1} di ${questions.length}</p>
      <form id="qform">
        <fieldset class="options">
          <legend class="quiz-q">${q.text}</legend>
          ${q.options.map((opt, i) => html`
            <label class="option">
              <input type="radio" name="answer" value="${i}" ${answers[step] === i ? 'checked' : ''}>
              <span class="key" aria-hidden="true">${KEYS[i]}</span>
              <span>${opt}</span>
            </label>`)}
        </fieldset>
        <div class="quiz-actions">
          <button type="button" class="btn btn--ghost" data-prev ${step === 0 ? 'disabled' : ''}>${icon('arrow-left')} Indietro</button>
          <button type="submit" class="btn btn--primary" ${answers[step] == null ? 'disabled' : ''}>
            ${last ? html`Invia le risposte ${icon('check')}` : html`Avanti ${icon('arrow-right')}`}
          </button>
        </div>
      </form>`);

    const form = $('#qform', root);
    const next = $('button[type=submit]', form);
    $$('input[name=answer]', form).forEach((input) => input.addEventListener('change', () => {
      answers[step] = Number(input.value);
      next.disabled = false;
    }));
    $('[data-prev]', form).addEventListener('click', () => { step -= 1; renderQuestion(root); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (answers[step] == null) return;
      if (!last) { step += 1; renderQuestion(root); return; }
      setButtonLoading(next, true, 'Correzione…');
      try {
        const result = await api(`/lessons/${pos}/quiz`, { method: 'POST', body: { answers } });
        renderResult(root, result);
      } catch (err) {
        toast(err.message, 'error');
        setButtonLoading(next, false);
      }
    });
    $('input[name=answer]:checked', form)?.focus() ?? $('input[name=answer]', form)?.focus();
  }

  function renderResult(root, r) {
    const pct = r.total ? Math.round((r.score / r.total) * 100) : 100;
    const needed = Math.ceil(passThreshold * r.total);
    const box = $('#quiz', root);
    if (r.passed) {
      const next = r.courseCompleted
        ? html`<a class="btn btn--primary btn--lg" href="#/completato">${icon('award')} Ritira il tuo badge</a>`
        : pos < total
          ? html`<a class="btn btn--primary btn--lg" href="#/lezione/${pos + 1}">Vai alla lezione ${pos + 1} ${icon('arrow-right')}</a>`
          : html`<a class="btn btn--primary btn--lg" href="#/corso">Torna al percorso</a>`;
      box.innerHTML = String(html`
        <div class="result">
          <div style="display:flex;justify-content:center;margin-bottom:20px">${ring(pct, { size: 140, stroke: 12, label: `${r.score}/${r.total}`, sub: 'corrette' })}</div>
          <h2>${r.courseCompleted ? 'Corso completato!' : 'Quiz superato!'}</h2>
          <p style="color:var(--text-muted)">${r.courseCompleted
            ? 'Hai concluso tutte le lezioni: il tuo Open Badge è in arrivo.'
            : `Ottimo lavoro: la lezione ${pos + 1} è ora sbloccata.`}</p>
          <div class="actions">${next}<a class="btn btn--secondary btn--lg" href="#/corso">Il tuo percorso</a></div>
          <div class="review">
            <h3 style="margin-top:8px">Rivedi le risposte</h3>
            ${questions.map((q, i) => {
              const it = r.review[i];
              const right = it.given === it.correct;
              return html`<div class="review-item ${right ? 'is-right' : 'is-wrong'}">
                <h4>${icon(right ? 'check' : 'x')}<span><span class="sr-only">${right ? 'Corretta: ' : 'Errata: '}</span>${q.text}</span></h4>
                <p><span class="answer">Risposta corretta: ${q.options[it.correct]}</span>${it.explanation ? html` — ${it.explanation}` : ''}</p>
              </div>`;
            })}
          </div>
        </div>`);
      animateRings(box);
      confetti(r.courseCompleted ? 3600 : 2400);
      if (r.courseCompleted) setTimeout(() => navigate('#/completato'), 2600);
    } else {
      box.innerHTML = String(html`
        <div class="result">
          <div class="result-icon result-icon--fail">${icon('retry')}</div>
          <h2>Ci sei quasi!</h2>
          <div class="score">${r.score}/${r.total}</div>
          <p style="color:var(--text-muted)">Servono almeno ${needed} risposte corrette su ${r.total} (${pct}% ottenuto). Puoi riprovare subito, oppure rivedere il video per ripassare.</p>
          <div class="actions">
            <button class="btn btn--primary btn--lg" data-retry>${icon('retry')} Riprova il quiz</button>
            <a class="btn btn--secondary btn--lg" href="#/lezione/${pos}">${icon('play')} Rivedi il video</a>
          </div>
        </div>`);
      $('[data-retry]', box).addEventListener('click', () => {
        answers.fill(null);
        step = 0;
        renderQuestion(root);
      });
    }
    box.scrollIntoView({ block: 'start', behavior: 'smooth' });
    box.querySelector('h2')?.setAttribute('tabindex', '-1');
    box.querySelector('h2')?.focus({ preventScroll: true });
  }

  return {
    view: shell,
    mount(root) {
      if (!questions.length) {
        // Lezione senza domande: basta confermare per proseguire.
        $('#quiz', root).innerHTML = String(html`<div class="result">
          <h2>Nessuna domanda per questa lezione</h2>
          <p style="color:var(--text-muted)">Conferma per completare la lezione e sbloccare la successiva.</p>
          <div class="actions"><button class="btn btn--primary btn--lg" data-confirm>Completa la lezione ${icon('check')}</button></div>
        </div>`);
        $('[data-confirm]', root).addEventListener('click', async () => {
          try { renderResult(root, await api(`/lessons/${pos}/quiz`, { method: 'POST', body: { answers: [] } })); }
          catch (err) { toast(err.message, 'error'); }
        });
        return;
      }
      renderQuestion(root);
    },
  };
}
