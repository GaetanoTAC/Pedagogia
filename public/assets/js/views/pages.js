import { html, icon, badgeArt, badge3d, formatDate, confetti, observeReveals, $ } from '../ui.js';
import { aurora, spinBadge } from '../motion.js';
import { api } from '../api.js';

export async function completeView() {
  const { lessons, user } = await api('/course');
  const done = lessons.every((l) => l.status === 'done');
  if (!done) {
    const left = lessons.filter((l) => l.status !== 'done').length;
    return {
      view: html`<section class="container--narrow prose" style="text-align:center">
        <div class="badge-card is-locked card" style="max-width:420px;margin:0 auto">
          ${badgeArt()}
          <h2>Ancora ${left} ${left === 1 ? 'lezione' : 'lezioni'}</h2>
          <p>Il badge si sblocca quando avrai completato tutte le lezioni e superato tutti i quiz.</p>
          <a class="btn btn--primary btn--block" href="#/corso">Continua il percorso ${icon('arrow-right')}</a>
        </div>
      </section>`,
    };
  }
  const minutes = Math.round(lessons.reduce((a, l) => a + l.durationSec, 0) / 60);
  const avg = Math.round((lessons.reduce((a, l) => a + (l.bestScore ?? 0), 0) / lessons.length) * 100);
  return {
    dark: true,
    view: html`
    <section class="complete-hero">
      <canvas class="aurora" aria-hidden="true"></canvas>
      <div class="container">
        ${badge3d({ label: 'Il tuo Open Badge Salute Orale: trascina per ruotarlo' })}
        <span class="chip chip--glass">${icon('sparkles')} Corso completato il ${formatDate(user.courseCompletedAt)}</span>
        <h1 style="margin-top:20px">Complimenti, ${user.firstName}!</h1>
        <p>Hai seguito tutte le ${lessons.length} videolezioni dall'inizio alla fine e superato tutti i quiz. Hai diritto all'Open Badge in Salute Orale.</p>
        <a class="btn btn--on-dark btn--lg" href="#/corso">${icon('arrow-left')} Torna al percorso</a>
      </div>
    </section>
    <section class="section">
      <div class="container" style="display:grid;gap:24px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
        <div class="card reveal" data-stagger data-glow data-tilt><h3>${icon('video')} ${lessons.length} lezioni</h3><p style="color:var(--text-muted);margin:0">Circa ${minutes} minuti di formazione seguiti per intero.</p></div>
        <div class="card reveal" data-stagger data-glow data-tilt><h3>${icon('checks')} Media quiz ${avg}%</h3><p style="color:var(--text-muted);margin:0">Calcolata sul miglior tentativo di ogni quiz.</p></div>
        <div class="card reveal" data-stagger data-glow data-tilt><h3>${icon('mail')} Rilascio del badge</h3><p style="color:var(--text-muted);margin:0">L'Università ti invierà il badge a <strong>${user.email}</strong>. Non devi fare nient'altro.</p></div>
      </div>
    </section>`,
    mount(root) {
      observeReveals(root);
      confetti(3000);
      const stops = [aurora($('.aurora', root)), spinBadge($('.badge-stage', root))];
      return () => stops.forEach((stop) => stop());
    },
  };
}

export function privacyView() {
  return {
    view: html`<article class="container--narrow prose">
      <span class="eyebrow">Informativa</span>
      <h1 style="font-size:2.2rem">Trattamento dei dati personali</h1>
      <div class="alert alert--warning">${icon('alert')}<span>Testo di esempio: va sostituito con l'informativa ufficiale predisposta dall'Ateneo prima della pubblicazione.</span></div>
      <h2>Quali dati raccogliamo</h2>
      <p>Nome, cognome, email istituzionale, numero di matricola e password (conservata in forma cifrata). Durante il corso registriamo l'avanzamento nella visione dei video e l'esito dei quiz.</p>
      <h2>Perché li raccogliamo</h2>
      <p>Per permetterti di seguire il corso, ricordare i tuoi progressi e verificare il completamento ai fini del rilascio dell'Open Badge da parte dell'Università degli Studi di Milano.</p>
      <h2>Chi può vederli</h2>
      <p>Solo i docenti responsabili del corso e il personale incaricato del rilascio dei badge. I dati non vengono ceduti a terzi per altre finalità.</p>
      <h2>Cookie</h2>
      <p>Il sito usa un solo cookie tecnico, necessario per mantenere l'accesso. Non usiamo cookie di profilazione.</p>
    </article>`,
  };
}

export function notFoundView() {
  return {
    view: html`<section class="container--narrow prose" style="text-align:center">
      <h1>Pagina non trovata</h1>
      <p>La pagina che cerchi non esiste o è stata spostata.</p>
      <a class="btn btn--primary" href="#/">Torna alla home</a>
    </section>`,
  };
}
