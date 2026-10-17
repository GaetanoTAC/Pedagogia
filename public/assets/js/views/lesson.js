import { html, icon, $, toast, confetti, formatClock, formatDuration } from '../ui.js';
import { api, beacon } from '../api.js';

const BEAT_MS = 8000;      // ogni quanto si inviano i progressi durante la riproduzione
const MAX_RATE = 2;        // velocità massima consentita (deve coincidere con il server)

function checklist(state) {
  const steps = [
    ['Guarda il video fino alla fine', state.status !== 'video'],
    ['Supera il quiz', state.status === 'done'],
    ['Sblocca la lezione successiva', state.status === 'done'],
  ];
  const activeIdx = steps.findIndex(([, done]) => !done);
  return html`<ol class="checklist">
    ${steps.map(([label, done], i) => html`
      <li class="${done ? 'is-done' : i === activeIdx ? 'is-active' : ''}">
        <span class="ck" aria-hidden="true">${done ? icon('check') : i + 1}</span>
        <span>${label}${done ? html`<span class="sr-only"> (fatto)</span>` : ''}</span>
      </li>`)}
  </ol>`;
}

function sideCard(state, total, questionCount) {
  const pct = state.status === 'video' ? state.watchedPct : 100;
  let action;
  if (state.status === 'video') {
    action = html`<button class="btn btn--primary btn--block" disabled aria-disabled="true">${icon('lock')} Quiz disponibile a fine video</button>`;
  } else if (state.status === 'quiz') {
    action = html`<a class="btn btn--primary btn--block btn--lg" href="#/lezione/${state.position}/quiz">${icon('quiz')} Vai al quiz</a>`;
  } else if (state.position < total) {
    action = html`<a class="btn btn--primary btn--block btn--lg" href="#/lezione/${state.position + 1}">Lezione successiva ${icon('arrow-right')}</a>
      <a class="btn btn--ghost btn--block" href="#/lezione/${state.position}/quiz" style="margin-top:8px">Rivedi il quiz</a>`;
  } else {
    action = html`<a class="btn btn--primary btn--block btn--lg" href="#/completato">${icon('award')} Vedi il tuo badge</a>`;
  }
  return html`
    <div class="watch-pct">
      <strong data-pct>${pct}%</strong>
      <span>del video visto</span>
    </div>
    <div class="progress ${pct >= 100 ? 'progress--success' : ''}" role="progressbar" aria-label="Video visto" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span data-bar style="width:${pct}%"></span></div>
    ${checklist(state)}
    ${action}
    <p style="margin:16px 0 0;font-size:.85rem;color:var(--text-muted)">${icon('quiz', 'inline')} Quiz di ${questionCount} domande · serve il 75% di risposte corrette.</p>`;
}

export async function lessonView({ params }) {
  const pos = Number(params.pos);
  const { lesson, total } = await api(`/lessons/${pos}`);
  let state = lesson;

  const view = html`
  <div class="container" style="padding-top:24px">
    <nav class="crumbs" aria-label="Percorso">
      <a href="#/corso">${icon('arrow-left')} Il tuo percorso</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">Lezione ${pos} di ${total}</span>
    </nav>

    <div class="lesson-layout">
      <div>
        <div class="player">
          ${lesson.hasVideo
            ? html`<video id="video" controls playsinline preload="metadata" controlslist="nodownload noplaybackrate" disablepictureinpicture src="${lesson.videoUrl}">
                Il tuo browser non supporta la riproduzione video.
              </video>`
            : html`<div class="player-empty"><div>${icon('video')}<strong>Video in arrivo</strong>Il docente non ha ancora pubblicato questa lezione. Torna a trovarci presto!</div></div>`}
        </div>
        <div class="lesson-info">
          <span class="eyebrow">Lezione ${pos}${lesson.durationSec ? ` · ${formatDuration(lesson.durationSec)}` : ''}</span>
          <h1>${lesson.title}</h1>
          <p>${lesson.description}</p>
          ${lesson.status === 'video'
            ? html`<div class="alert alert--info">${icon('info')}<span>Puoi mettere in pausa e tornare quando vuoi: i progressi si salvano da soli. Puoi rivedere i passaggi già visti, ma non saltare in avanti.</span></div>`
            : ''}
          ${lesson.hasVideo && lesson.status === 'video' && lesson.watchedSec > 5
            ? html`<p style="margin-top:16px;font-weight:600;color:var(--navy-800)">${icon('play', 'inline')} Riprendi da ${formatClock(lesson.watchedSec)}</p>`
            : ''}
        </div>
      </div>
      <aside class="side-stack">
        <section class="card watch-card" id="side" aria-live="polite">${sideCard(state, total, lesson.questionCount)}</section>
      </aside>
    </div>
  </div>`;

  return {
    view,
    mount(root) {
      const video = $('#video', root);
      if (!video) return () => {};

      let watched = lesson.watchedSec;          // confermato dal server
      let reached = watched;                    // punto più avanzato raggiunto in questa sessione
      let completed = lesson.status !== 'video';
      let segStart = null;
      let lastTime = 0;
      let timer = null;
      let sending = false;

      const refreshSide = () => { $('#side', root).innerHTML = String(sideCard(state, total, lesson.questionCount)); };
      const updatePct = () => {
        if (completed || !video.duration) return;
        const pct = Math.min(99, Math.floor((Math.max(watched, reached) / video.duration) * 100));
        const label = $('[data-pct]', root);
        if (label) { label.textContent = `${pct}%`; $('[data-bar]', root).style.width = `${pct}%`; }
      };

      async function send(from, to, { final = false } = {}) {
        if (completed || to <= from + 0.2) return;
        // `reached` cresce solo con visione continua: se un invio precedente è andato
        // perso, il tratto fra `watched` e `from` è stato comunque visto davvero.
        if (from > watched && from <= reached + 2) from = watched;
        const body = { from, to, duration: video.duration || 0 };
        if (final) return beacon(`/lessons/${pos}/progress`, body);
        if (sending) return;
        sending = true;
        try {
          const res = await api(`/lessons/${pos}/progress`, { method: 'POST', body });
          watched = Math.max(watched, res.watchedSec);
          if (res.completed && !completed) {
            completed = true;
            state = { ...state, status: 'quiz', watchedPct: 100 };
            refreshSide();
            confetti(1800);
            toast('Video completato! Ora puoi fare il quiz.', 'success');
          }
          updatePct();
        } catch { /* nuovo tentativo al prossimo invio */ } finally { sending = false; }
      }

      const flush = (opts) => {
        if (segStart != null) send(segStart, lastTime, opts);
        segStart = video.paused ? null : video.currentTime;
      };

      video.addEventListener('loadedmetadata', () => {
        if (!completed && watched > 3 && watched < video.duration - 3) video.currentTime = watched - 2;
      });
      video.addEventListener('play', () => {
        segStart = video.currentTime;
        lastTime = video.currentTime;
        clearInterval(timer);
        timer = setInterval(() => flush(), BEAT_MS);
      });
      video.addEventListener('pause', () => { clearInterval(timer); flush(); });
      video.addEventListener('ended', () => { clearInterval(timer); lastTime = video.duration; flush(); });
      video.addEventListener('timeupdate', () => {
        if (video.seeking) return;
        const t = video.currentTime;
        if (t <= Math.max(watched, reached) + 2) reached = Math.max(reached, t);
        lastTime = t;
        updatePct();
      });
      video.addEventListener('seeking', () => {
        const limit = Math.max(watched, reached);
        if (!completed && video.currentTime > limit + 1) {
          video.currentTime = limit;
          toast('Puoi andare avanti solo fino al punto già visto.');
          return;
        }
        // Chiude il tratto guardato prima del salto e ne apre uno nuovo.
        if (segStart != null) send(segStart, lastTime);
        segStart = null;
      });
      video.addEventListener('seeked', () => {
        lastTime = video.currentTime;
        if (!video.paused) segStart = video.currentTime;
      });
      video.addEventListener('ratechange', () => {
        if (video.playbackRate > MAX_RATE) video.playbackRate = MAX_RATE;
      });

      const onHide = () => { if (document.visibilityState === 'hidden') flush({ final: true }); };
      const onUnload = () => flush({ final: true });
      document.addEventListener('visibilitychange', onHide);
      window.addEventListener('pagehide', onUnload);

      return () => {
        clearInterval(timer);
        if (!video.paused) { lastTime = video.currentTime; flush({ final: true }); }
        video.pause();
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onUnload);
      };
    },
  };
}
