import { html, icon, ring, badge3d, formatDuration, formatDate, animateRings, observeReveals, $ } from '../ui.js';
import { aurora, countUp, spinBadge } from '../motion.js';
import { api } from '../api.js';

const STATUS = {
  done: { chip: html`<span class="chip chip--success">${icon('check')} Completata</span>` },
  quiz: { chip: html`<span class="chip chip--warning">${icon('quiz')} Quiz da fare</span>` },
  video: { chip: html`<span class="chip">${icon('play')} Da guardare</span>` },
  locked: { chip: html`<span class="chip chip--muted">${icon('lock')} Bloccata</span>` },
};

function lessonItem(l, currentPos) {
  const isCurrent = l.position === currentPos;
  const cls = l.status === 'done' ? 'is-done' : l.status === 'locked' ? 'is-locked' : '';
  const inner = html`
    <div class="lesson-card-body">
      <h3>${l.title}</h3>
      <div class="meta">
        ${STATUS[l.status].chip}
        ${l.durationSec ? html`<span>${icon('clock')} ${formatDuration(l.durationSec)}</span>` : ''}
        ${l.status === 'done' && l.bestScore != null ? html`<span>${icon('checks')} Quiz ${Math.round(l.bestScore * 100)}%</span>` : ''}
      </div>
      ${l.status === 'video' && l.watchedPct > 0
        ? html`<div class="progress" role="progressbar" aria-label="Video visto" aria-valuenow="${l.watchedPct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${l.watchedPct}%"></span></div>`
        : ''}
    </div>
    ${l.status === 'locked' ? '' : html`<span class="go">${icon('chevron')}</span>`}`;

  return html`
    <li class="path-item ${cls} ${isCurrent ? 'is-current' : ''} reveal" data-stagger>
      <span class="path-node" aria-hidden="true">${l.status === 'done' ? icon('check') : l.status === 'locked' ? icon('lock') : l.position}</span>
      ${l.status === 'locked'
        ? html`<div class="lesson-card" aria-label="${`Lezione ${l.position}, bloccata`}">${inner}</div>`
        : html`<a class="lesson-card" data-glow href="#/lezione/${l.position}" ${isCurrent ? html`aria-current="step"` : ''}><span class="sr-only">Lezione ${l.position}: </span>${inner}</a>`}
    </li>`;
}

export async function dashboardView() {
  const { lessons, user } = await api('/course');
  const total = lessons.length;
  const done = lessons.filter((l) => l.status === 'done').length;
  const current = lessons.find((l) => l.status !== 'done');
  const pct = total ? (done / total) * 100 : 0;
  const watchedMin = Math.round(lessons.reduce((acc, l) => acc + (l.status === 'done' || l.status === 'quiz' ? l.durationSec : l.watchedSec), 0) / 60);
  const quizzes = lessons.filter((l) => l.quizPassedAt).length;
  const completed = !current;

  let headline, sub, cta;
  if (completed) {
    headline = 'Hai completato il corso!';
    sub = 'Complimenti: hai seguito tutte le lezioni e superato tutti i quiz.';
    cta = html`<a class="btn btn--primary btn--lg" href="#/completato">${icon('award')} Vedi il tuo badge</a>`;
  } else if (current.status === 'quiz') {
    headline = `Manca solo il quiz della lezione ${current.position}`;
    sub = current.title;
    cta = html`<a class="btn btn--primary btn--lg" href="#/lezione/${current.position}/quiz">${icon('quiz')} Fai il quiz</a>`;
  } else {
    const started = current.watchedSec > 0;
    headline = done === 0 && !started ? 'Iniziamo dalla prima lezione' : `Prossima tappa: lezione ${current.position}`;
    sub = current.title;
    cta = html`<a class="btn btn--primary btn--lg" href="#/lezione/${current.position}">${icon('play')} ${started ? 'Riprendi la lezione' : 'Guarda la lezione'}</a>`;
  }

  const view = html`
  <div class="container">
    <header class="page-head">
      <span class="eyebrow">Il tuo percorso</span>
      <h1 style="font-size:clamp(1.8rem,3.5vw,2.6rem)">Ciao, ${user.firstName}</h1>
      <p>${completed ? 'Il tuo percorso è completo.' : 'Le lezioni si sbloccano in ordine: guarda il video fino alla fine e supera il quiz per andare avanti.'}</p>
    </header>

    <div class="dash-grid">
      <div>
        <section class="overview reveal" aria-label="Riepilogo avanzamento">
          <canvas class="aurora" aria-hidden="true"></canvas>
          ${ring(pct, { size: 132, stroke: 11, label: `${Math.round(pct)}%`, sub: `${done} di ${total}` })}
          <div class="overview-body">
            <h2>${headline}</h2>
            <p>${sub}</p>
            ${cta}
          </div>
        </section>

        <ol class="path" aria-label="Lezioni del corso">
          ${lessons.map((l) => lessonItem(l, current?.position))}
        </ol>
      </div>

      <aside class="side-stack">
        <section class="card side-card reveal" data-delay="80">
          <h3>${icon('sparkles')} I tuoi numeri</h3>
          <div class="stat-row">
            <div class="stat"><strong data-count="${done}">${done}</strong><span>lezioni</span></div>
            <div class="stat"><strong data-count="${watchedMin}">${watchedMin}</strong><span>minuti</span></div>
            <div class="stat"><strong data-count="${quizzes}">${quizzes}</strong><span>quiz</span></div>
          </div>
        </section>

        <section class="card badge-card ${completed ? '' : 'is-locked'} reveal" data-delay="160">
          ${badge3d({ label: completed ? 'Open Badge sbloccato' : 'Open Badge, ancora da sbloccare' })}
          <h3 style="justify-content:center">${completed ? 'Badge sbloccato' : 'Open Badge'}</h3>
          ${completed
            ? html`<p>Corso completato il ${formatDate(user.courseCompletedAt)}. Il badge ti sarà inviato dall'Università.</p>
                   <a class="btn btn--secondary btn--block" href="#/completato">Dettagli</a>`
            : html`<p>Completa tutte le ${total} lezioni e i quiz per ottenere il badge. Te ne mancano ${total - done}.</p>
                   <div class="progress"><span style="width:${pct}%"></span></div>`}
        </section>
      </aside>
    </div>
  </div>`;

  return {
    view,
    mount(root) {
      animateRings(root);
      observeReveals(root);
      countUp(root);
      const stops = [aurora($('.overview .aurora', root)), spinBadge($('.badge-stage', root))];
      return () => stops.forEach((stop) => stop());
    },
  };
}
