import { html, icon, ring, badgeArt, badge3d, splitWords, formatDuration, animateRings, observeReveals, $ } from '../ui.js';
import { aurora, tilt3d, spinBadge, countUp } from '../motion.js';
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
  <li class="syl-item reveal" data-stagger data-glow data-tilt>
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

export async function landingView({ user, section }) {
  let lessons = [];
  try { ({ lessons } = await api('/course/public')); } catch { /* il programma resta vuoto */ }
  const start = user ? '#/corso' : '#/registrati';
  const startLabel = user ? 'Vai al tuo percorso' : 'Inizia il corso';
  const preview = lessons.slice(0, 4);
  const total = lessons.length || 10;

  const view = html`
  <section class="hero" id="hero">
    <canvas class="aurora" aria-hidden="true"></canvas>
    <div class="hero-noise" aria-hidden="true"></div>
    <div class="container hero-grid">
      <div class="hero-copy">
        <span class="chip chip--glass hero-chip">${icon('sparkles')} Corso online gratuito · Open Badge</span>
        <h1 class="split">${splitWords('Il tuo sorriso,')} <span class="grad-text">${splitWords('una lezione alla volta.', 3)}</span></h1>
        <p class="hero-lead">Dieci videolezioni brevi per capire come prenderti cura della bocca: igiene quotidiana, prevenzione, alimentazione e stili di vita. Alla fine ricevi l'Open Badge dell'Università.</p>
        <div class="hero-actions">
          <a class="btn btn--primary btn--lg btn--shine" href="${start}">${startLabel} ${icon('arrow-right')}</a>
          <a class="btn btn--on-dark btn--lg" href="#/programma">Scopri il programma</a>
        </div>
        <dl class="hero-stats">
          <div><dt class="sr-only">Videolezioni</dt><dd><strong data-count="${total}">${total}</strong><span>videolezioni</span></dd></div>
          <div><dt class="sr-only">Durata</dt><dd><strong data-count="20" data-prefix="~" data-suffix="′">~20′</strong><span>per lezione</span></dd></div>
          <div><dt class="sr-only">Quiz</dt><dd><strong data-count="${total}">${total}</strong><span>quiz brevi</span></dd></div>
          <div><dt class="sr-only">Attestato</dt><dd><strong>1</strong><span>Open Badge</span></dd></div>
        </dl>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <div class="scene">
          <div class="mock">
            <div class="mock-glass"></div>
            <div class="mock-top layer" style="--z:40px">
              ${ring(30, { size: 76, stroke: 7, label: '3/10' })}
              <div><h3>Il tuo percorso</h3><p>Prossima tappa: lezione 4</p></div>
            </div>
            <ul class="mock-list">
              ${preview.map((l, i) => html`
                <li class="mock-item layer ${i < 3 ? 'is-done' : 'is-current'}" style="--z:${20 + i * 6}px">
                  <span class="dot">${i < 3 ? icon('check') : i + 1}</span>
                  <span class="grow">${l.title}</span>
                  ${i === 3 ? html`<span class="mini"><span></span></span>` : ''}
                </li>`)}
            </ul>
            <div class="float-quiz layer" style="--z:90px"><span class="check">${icon('check')}</span> Quiz superato · 4/4</div>
            <div class="float-badge layer" style="--z:120px">${badgeArt({ decorative: true })}<strong>Open Badge</strong><span>Salute orale</span></div>
          </div>
        </div>
      </div>
    </div>
    <a class="scroll-hint" href="#/come-funziona" aria-label="Scorri a come funziona"><span></span></a>
  </section>

  ${marquee()}

  <section class="section" id="come-funziona">
    <div class="container">
      <div class="section-head section-head--center reveal">
        <span class="eyebrow">Come funziona</span>
        <h2>Tre passi, al tuo ritmo</h2>
        <p>Nessun orario da rispettare: entri quando vuoi e riprendi esattamente da dove avevi lasciato.</p>
      </div>
      <div class="steps reveal">
        <div class="steps-line" aria-hidden="true"><span></span></div>
        <article class="step" data-glow data-tilt style="--d:0">
          <span class="step-num" aria-hidden="true">01</span>
          <div class="step-icon">${icon('play')}</div>
          <h3>Guarda la videolezione</h3>
          <p>Ogni lezione dura circa 20 minuti. Il sito salva i tuoi progressi in automatico, anche se chiudi la pagina.</p>
        </article>
        <article class="step" data-glow data-tilt style="--d:1">
          <span class="step-num" aria-hidden="true">02</span>
          <div class="step-icon">${icon('checks')}</div>
          <h3>Rispondi al quiz</h3>
          <p>Poche domande per fissare i concetti chiave. Superato il quiz, si sblocca la lezione successiva.</p>
        </article>
        <article class="step" data-glow data-tilt style="--d:2">
          <span class="step-num" aria-hidden="true">03</span>
          <div class="step-icon">${icon('award')}</div>
          <h3>Ottieni l'Open Badge</h3>
          <p>Completate tutte le lezioni, l'Università ti rilascia un attestato digitale verificabile da aggiungere al CV.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="section section--programma" id="programma">
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
        tilt3d($('.mock', root), { max: 9, area: $('#hero', root) }),
        spinBadge($('.badge-stage', root)),
      ];
      if (section) $(`#${section}`, root)?.scrollIntoView({ block: 'start' });
      return () => stops.forEach((stop) => stop?.());
    },
  };
}
