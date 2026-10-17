import { html, icon, badge3d, splitWords, formatDuration, animateRings, observeReveals, prefersReducedMotion, $, $$ } from '../ui.js';
import { aurora, spinBadge, countUp } from '../motion.js';
import { createStoryScene } from '../scene3d.js';
import { api } from '../api.js';

const FAQ = [
  ['Chi può partecipare?', 'Il corso è riservato a studentesse e studenti dell\'Università degli Studi di Milano: per registrarti serve l\'indirizzo email istituzionale.'],
  ['Quanto dura il corso?', 'Sono 10 videolezioni da circa 20 minuti, per un totale di poco più di tre ore. Puoi seguirle quando vuoi, anche in più giorni: il sito ricorda dove eri arrivato.'],
  ['Posso saltare parti del video?', 'Puoi tornare indietro e rivedere quanto vuoi, ma non è possibile andare avanti oltre il punto già visto: per ottenere il badge ogni video va seguito fino alla fine.'],
  ['Come funzionano i quiz?', 'Dopo ogni video trovi qualche breve domanda a risposta multipla. Superato il quiz si sblocca la lezione successiva. Se non lo superi puoi riprovare tutte le volte che vuoi.'],
  ['Cos\'è un Open Badge?', 'È un attestato digitale verificabile che certifica una competenza. Contiene i dati di chi lo rilascia e di cosa hai fatto, e puoi condividerlo nel tuo CV o sui social professionali.'],
  ['Quando ricevo il badge?', 'Dopo aver completato tutte le lezioni e tutti i quiz, i tuoi dati vengono trasmessi all\'Università, che rilascia il badge all\'indirizzo email istituzionale.'],
];

const TOPICS = ['Anatomia del cavo orale', 'Placca e biofilm', 'Carie', 'Gengivite', 'Parodontite', 'Spazzolamento',
  'Filo interdentale', 'Scovolini', 'Alimentazione', 'Erosione dentale', 'Fumo e alcol', 'Fluoro', 'Sigillature', 'Bocca e salute generale'];

const syllabusItem = (l, i) => html`
  <li class="syl-item reveal" data-stagger data-tilt>
    <span class="syl-num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
    <div>
      <h3><span class="sr-only">Lezione ${i + 1}: </span>${l.title}</h3>
      <p>${l.description}</p>
      <div class="syl-meta">
        <span>${icon('video')} ${formatDuration(l.durationSec) || 'circa 20 min'}</span>
        <span>${icon('quiz')} Quiz finale</span>
      </div>
    </div>
  </li>`;

const marquee = () => html`
  <div class="marquee" aria-hidden="true">
    <div class="marquee-track">
      ${[0, 1].map(() => html`<ul>${TOPICS.map((t) => html`<li>${icon('sparkles')}${t}</li>`)}</ul>`)}
    </div>
  </div>`;

/**
 * Capitoli guidati dallo scorrimento: la sezione è alta N schermate e il suo
 * contenuto resta fermo mentre il dente 3D cambia posa capitolo dopo capitolo.
 */
function story(section) {
  const n = Number(getComputedStyle(section).getPropertyValue('--n')) || 5;
  const chapters = $$('.ch', section);
  const dots = $$('.story-dot', section);
  const bar = $('.story-progress span', section);
  const canvas = $('.story-canvas', section);
  const reduced = prefersReducedMotion();
  let scene = null, disposed = false, active = 0, ticking = false;

  const progress = () => {
    const r = section.getBoundingClientRect();
    const total = section.offsetHeight - innerHeight;
    return total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
  };
  const update = () => {
    ticking = false;
    const p = progress();
    scene?.setProgress(p);
    section.style.setProperty('--p', p.toFixed(4));
    bar.style.transform = `scaleX(${p})`;
    const idx = Math.round(p * (n - 1));
    if (idx !== active) {
      active = idx;
      chapters.forEach((c) => c.classList.toggle('is-active', Number(c.dataset.ch) === idx));
      dots.forEach((d, i) => d.classList.toggle('is-active', i === idx));
    }
  };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  const onResize = () => { scene?.resize(); update(); };
  const onPointer = (e) => scene?.setPointer((e.clientX / innerWidth - 0.5) * 2, (e.clientY / innerHeight - 0.5) * 2);
  dots.forEach((d) => d.addEventListener('click', () => {
    const total = section.offsetHeight - innerHeight;
    const top = section.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (Number(d.dataset.go) / (n - 1)) * total + 1, behavior: reduced ? 'auto' : 'smooth' });
  }));
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('pointermove', onPointer, { passive: true });

  const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) scene?.start(); else scene?.stop(); });
  createStoryScene(canvas, { reducedMotion: reduced })
    .then((s) => {
      if (disposed) { s?.dispose(); return; }
      if (!s) { section.classList.add('story--nogl'); return; }
      scene = s;
      section.classList.add('story--ready');
      update();
      scene.setProgress(progress());
      io.observe(section);
    })
    .catch(() => section.classList.add('story--nogl'));
  update();

  return () => {
    disposed = true;
    io.disconnect();
    scene?.dispose();
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
    removeEventListener('pointermove', onPointer);
  };
}

export async function landingView({ user, section }) {
  let lessons = [];
  try { ({ lessons } = await api('/course/public')); } catch { /* il programma resta vuoto */ }
  const start = user ? '#/corso' : '#/registrati';
  const startLabel = user ? 'Vai al tuo percorso' : 'Inizia il corso';
  const total = lessons.length || 10;

  const chapters = [
    { icon: 'sparkles', label: 'Inizio' },
    { icon: 'play', label: 'Guarda' },
    { icon: 'checks', label: 'Verifica' },
    { icon: 'award', label: 'Badge' },
    { icon: 'book', label: 'Lezioni' },
  ];

  const view = html`
  <section class="story" id="hero" style="--n:${chapters.length}">
    <div class="story-sticky">
      <div class="story-bg" aria-hidden="true"></div>
      <div class="story-bigtext" aria-hidden="true"><span>SORRISO</span><span>IN SALUTE</span></div>
      <canvas class="story-canvas" aria-hidden="true"></canvas>
      <img class="story-fallback" src="assets/favicon.svg" alt="" aria-hidden="true">

      <div class="container story-overlay">
        <div class="ch ch--intro is-active" data-ch="0">
          <div class="ch-intro-copy">
            <span class="chip chip--glass hero-chip">${icon('sparkles')} Corso online gratuito · Open Badge</span>
            <h1 class="split">${splitWords('Il tuo sorriso,')} <span class="grad-text">${splitWords('una lezione alla volta.', 3)}</span></h1>
            <p class="hero-lead">Dieci videolezioni brevi per prenderti cura della bocca. Alla fine ricevi l'Open Badge dell'Università.</p>
          </div>
          <div class="hero-actions">
            <a class="btn btn--primary btn--lg btn--shine" href="${start}">${startLabel} ${icon('arrow-right')}</a>
            <a class="btn btn--glass btn--lg" href="#/programma">Il programma</a>
          </div>
        </div>

        <article class="ch glass-panel" data-ch="1">
          <span class="ch-step">Passo 1 di 3</span>
          <div class="step-icon">${icon('play')}</div>
          <h2>Guarda la videolezione</h2>
          <p>Ogni lezione dura circa 20 minuti. Il sito salva i progressi da solo: chiudi quando vuoi e riprendi da dove eri rimasto.</p>
        </article>
        <article class="ch glass-panel" data-ch="2">
          <span class="ch-step">Passo 2 di 3</span>
          <div class="step-icon">${icon('checks')}</div>
          <h2>Rispondi al quiz</h2>
          <p>Poche domande per fissare i concetti chiave. Superato il quiz si sblocca la lezione successiva.</p>
        </article>
        <article class="ch glass-panel" data-ch="3">
          <span class="ch-step">Passo 3 di 3</span>
          <div class="step-icon">${icon('award')}</div>
          <h2>Ottieni l'Open Badge</h2>
          <p>Completate tutte le lezioni, l'Università ti rilascia un attestato digitale verificabile da aggiungere al CV.</p>
        </article>
        <article class="ch glass-panel" data-ch="4">
          <span class="ch-step">Il programma</span>
          <h2><span data-count="${total}">${total}</span> lezioni, una dopo l'altra</h2>
          <p>Dall'anatomia della bocca al legame con la salute generale. Si sbloccano in ordine, al tuo ritmo.</p>
          <a class="btn btn--glass" href="#/programma">Vedi tutte le lezioni ${icon('arrow-right')}</a>
        </article>
      </div>

      <nav class="story-nav" aria-label="Capitoli">
        ${chapters.map((c, i) => html`<button type="button" class="story-dot ${i === 0 ? 'is-active' : ''}" data-go="${i}" aria-label="${c.label}">${icon(c.icon)}</button>`)}
      </nav>
      <div class="story-progress" aria-hidden="true"><span></span></div>
    </div>
  </section>

  ${marquee()}

  <section class="section section--programma" id="programma">
    <canvas class="aurora aurora--soft" aria-hidden="true"></canvas>
    <div class="container">
      <div class="section-head reveal">
        <span class="eyebrow">Il programma</span>
        <h2>Dieci lezioni per una bocca in salute</h2>
        <p>Dalle basi di anatomia fino al legame tra salute orale e salute generale. Le lezioni si sbloccano in ordine.</p>
      </div>
      <ol class="syllabus">
        ${lessons.map(syllabusItem)}
      </ol>
    </div>
  </section>

  <section class="section badge-section">
    <canvas class="aurora aurora--soft" aria-hidden="true"></canvas>
    <div class="container badge-grid">
      <div class="badge-3d-wrap reveal">
        ${badge3d()}
        <p class="drag-hint">${icon('retry')} Trascina per ruotarlo</p>
      </div>
      <div class="reveal" data-delay="120">
        <span class="eyebrow">Il riconoscimento</span>
        <h2>Un badge che parla di te</h2>
        <p class="badge-lead">L'Open Badge è un attestato digitale standard, riconosciuto a livello internazionale.</p>
        <ul class="feature-list">
          <li><span class="fi">${icon('shield')}</span><div><strong>Verificabile</strong><span>Contiene i dati dell'ente che lo rilascia e i criteri per ottenerlo.</span></div></li>
          <li><span class="fi">${icon('share')}</span><div><strong>Condivisibile</strong><span>Aggiungilo al CV, al profilo professionale o al tuo portfolio.</span></div></li>
          <li><span class="fi">${icon('cap')}</span><div><strong>Rilasciato dall'Università</strong><span>Lo ricevi all'email istituzionale dopo aver completato il corso.</span></div></li>
        </ul>
        <a class="btn btn--primary btn--lg btn--shine" href="${start}">${startLabel} ${icon('arrow-right')}</a>
      </div>
    </div>
  </section>

  <section class="section" id="faq">
    <div class="container--narrow">
      <div class="section-head section-head--center reveal">
        <span class="eyebrow">Domande frequenti</span>
        <h2>Tutto quello che ti serve sapere</h2>
      </div>
      <div class="faq">
        ${FAQ.map(([q, a]) => html`<details class="reveal" data-stagger><summary>${q} ${icon('plus')}</summary><p>${a}</p></details>`)}
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="container">
      <div class="cta-band reveal" data-glow>
        <div>
          <h2>Pronto a iniziare?</h2>
          <p>Registrati con la tua email istituzionale: ci vuole meno di un minuto.</p>
        </div>
        <a class="btn btn--lg btn--shine" href="${start}">${startLabel} ${icon('arrow-right')}</a>
      </div>
    </div>
  </section>`;

  return {
    view,
    dark: true,
    mount(root) {
      animateRings(root);
      observeReveals(root);
      countUp(root);
      const stops = [
        ...[...root.querySelectorAll('canvas.aurora')].map(aurora),
        spinBadge($('.badge-stage', root)),
        story($('.story', root)),
      ];
      if (section) $(`#${section}`, root)?.scrollIntoView({ block: 'start' });
      return () => stops.forEach((stop) => stop?.());
    },
  };
}
