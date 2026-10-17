import { html, icon, $, $$, toast, setButtonLoading, formatDate, formatDuration } from '../ui.js';
import { api, uploadFile } from '../api.js';

const optionRow = (qi, oi, text, checked) => html`
  <div class="opt-row">
    <input type="radio" name="correct-${qi}" value="${oi}" ${checked ? 'checked' : ''} aria-label="${`Risposta ${oi + 1} corretta`}">
    <input class="input" data-opt value="${text}" placeholder="${`Risposta ${oi + 1}`}" aria-label="${`Testo risposta ${oi + 1}`}">
    <button type="button" class="icon-btn" data-del-opt aria-label="Elimina risposta">${icon('x')}</button>
  </div>`;

let qSeq = 0;
const questionBlock = (q = { text: '', options: ['', ''], correct: 0, explanation: '' }) => {
  const qi = ++qSeq;
  return html`
  <div class="q-block" data-q="${qi}">
    <div class="q-block-head">
      <strong data-q-title>Domanda</strong>
      <button type="button" class="btn btn--danger btn--sm" data-del-q>${icon('trash')} Elimina</button>
    </div>
    <div class="field"><label>Testo della domanda</label><textarea class="textarea" data-text rows="2">${q.text}</textarea></div>
    <div class="field">
      <label>Risposte <span class="hint">(seleziona il pallino della risposta corretta)</span></label>
      <div class="opts" style="display:grid;gap:8px">${q.options.map((o, oi) => optionRow(qi, oi, o, oi === q.correct))}</div>
      <button type="button" class="btn btn--ghost btn--sm" data-add-opt style="justify-self:start">${icon('plus')} Aggiungi risposta</button>
    </div>
    <div class="field"><label>Spiegazione (mostrata dopo il superamento)</label><input class="input" data-expl value="${q.explanation}"></div>
  </div>`;
};

function lessonPanel(l) {
  return html`
  <details class="admin-lesson" data-pos="${l.position}">
    <summary>
      <span class="syl-num">${String(l.position).padStart(2, '0')}</span>
      <h3>${l.title}</h3>
      ${l.videoUrl ? html`<span class="chip chip--success">${icon('video')} ${formatDuration(l.durationSec) || 'Video'}</span>` : html`<span class="chip chip--warning">${icon('alert')} Senza video</span>`}
      <span class="chip chip--muted hide-sm">${l.questions.length} domande</span>
    </summary>
    <form class="admin-body" novalidate>
      <div class="admin-grid">
        <div class="field"><label>Titolo</label><input class="input" name="title" value="${l.title}" required></div>
        <div class="field"><label>Soglia di superamento del quiz</label>
          <select class="select input" name="passThreshold">
            ${[0.5, 0.6, 0.66, 0.75, 0.8, 1].map((t) => html`<option value="${t}" ${Math.abs(t - l.passThreshold) < 0.001 ? 'selected' : ''}>${Math.round(t * 100)}% di risposte corrette</option>`)}
          </select>
        </div>
      </div>
      <div class="field"><label>Descrizione</label><textarea class="textarea" name="description" rows="2">${l.description}</textarea></div>

      <div class="upload-box">
        <strong style="font-family:var(--font-head)">${icon('video')} Video della lezione</strong>
        <video controls preload="metadata" ${l.videoUrl ? html`src="${l.videoUrl}"` : 'hidden'} data-preview></video>
        <div class="admin-grid">
          <div class="field"><label>Carica un file (MP4 o WebM)</label><input class="input" type="file" accept="video/mp4,video/webm" data-file></div>
          <div class="field"><label>…oppure indirizzo del video (URL di un file MP4)</label><input class="input" name="videoUrl" value="${l.videoUrl}" placeholder="https://…/lezione.mp4"></div>
        </div>
        <div class="field"><label>Durata in secondi</label><input class="input" name="durationSec" type="number" min="0" step="1" value="${Math.round(l.durationSec) || ''}" style="max-width:200px">
          <span class="hint">Si compila da sola quando il video viene caricato nell'anteprima.</span></div>
        <div class="progress" hidden data-up-progress><span style="width:0%"></span></div>
      </div>

      <div>
        <h3 style="margin-bottom:12px">Quiz</h3>
        <div class="q-editor">${l.questions.map((q) => questionBlock(q))}</div>
        <button type="button" class="btn btn--secondary btn--sm" data-add-q style="margin-top:12px">${icon('plus')} Aggiungi domanda</button>
      </div>

      <div class="admin-actions">
        <button type="submit" class="btn btn--primary">${icon('check')} Salva lezione</button>
      </div>
    </form>
  </details>`;
}

function renumber(form) {
  $$('.q-block', form).forEach((b, i) => { $('[data-q-title]', b).textContent = `Domanda ${i + 1}`; });
}

function collect(form) {
  const fd = new FormData(form);
  const questions = $$('.q-block', form).map((b) => {
    const opts = $$('.opt-row', b);
    const correct = opts.findIndex((row) => $('input[type=radio]', row).checked);
    // Le risposte vuote vengono scartate: l'indice della corretta va ricalcolato.
    const filled = opts.map((row, i) => ({ text: $('[data-opt]', row).value.trim(), i })).filter((o) => o.text);
    return {
      text: $('[data-text]', b).value,
      options: filled.map((o) => o.text),
      correct: filled.findIndex((o) => o.i === correct),
      explanation: $('[data-expl]', b).value,
    };
  });
  return {
    title: fd.get('title'),
    description: fd.get('description'),
    videoUrl: fd.get('videoUrl'),
    durationSec: Number(fd.get('durationSec')) || 0,
    passThreshold: Number(fd.get('passThreshold')),
    questions,
  };
}

function bindLesson(panel) {
  const pos = Number(panel.dataset.pos);
  const form = $('form', panel);
  const preview = $('[data-preview]', panel);
  renumber(form);

  form.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-add-q]')) {
      $('.q-editor', form).insertAdjacentHTML('beforeend', String(questionBlock()));
      renumber(form);
    } else if (t.matches('[data-del-q]')) {
      if (confirm('Eliminare questa domanda?')) { t.closest('.q-block').remove(); renumber(form); }
    } else if (t.matches('[data-add-opt]')) {
      const block = t.closest('.q-block');
      const opts = $('.opts', block);
      opts.insertAdjacentHTML('beforeend', String(optionRow(block.dataset.q, opts.children.length, '', false)));
    } else if (t.matches('[data-del-opt]')) {
      const opts = t.closest('.opts');
      if (opts.children.length <= 2) return toast('Servono almeno due risposte.', 'error');
      t.closest('.opt-row').remove();
    }
  });

  preview.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(preview.duration)) form.durationSec.value = Math.round(preview.duration);
  });
  form.videoUrl.addEventListener('change', () => {
    const url = form.videoUrl.value.trim();
    preview.hidden = !url;
    if (url) preview.src = url;
  });

  $('[data-file]', panel).addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Legge la durata dal file locale prima di caricarlo.
    const localUrl = URL.createObjectURL(file);
    const duration = await new Promise((resolve) => {
      const probe = document.createElement('video');
      probe.preload = 'metadata';
      probe.onloadedmetadata = () => resolve(probe.duration);
      probe.onerror = () => resolve(0);
      probe.src = localUrl;
    });
    URL.revokeObjectURL(localUrl);
    const bar = $('[data-up-progress]', panel);
    bar.hidden = false;
    const fd = new FormData();
    fd.append('durationSec', String(Math.round(duration) || ''));
    fd.append('video', file);
    try {
      const { lesson } = await uploadFile(`/admin/lessons/${pos}/video`, fd, (p) => { bar.firstElementChild.style.width = `${Math.round(p * 100)}%`; });
      form.videoUrl.value = lesson.videoUrl;
      form.durationSec.value = Math.round(lesson.durationSec) || '';
      preview.hidden = false;
      preview.src = lesson.videoUrl;
      toast(`Video della lezione ${pos} caricato.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      bar.hidden = true;
      bar.firstElementChild.style.width = '0%';
      e.target.value = '';
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    setButtonLoading(btn, true, 'Salvataggio…');
    try {
      const { lesson } = await api(`/admin/lessons/${pos}`, { method: 'PUT', body: collect(form) });
      $('summary h3', panel).textContent = lesson.title;
      toast(`Lezione ${pos} salvata.`, 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setButtonLoading(btn, false);
    }
  });
}

function studentsPanel({ students, totalLessons }) {
  const completed = students.filter((s) => s.completedAt).length;
  const active = students.filter((s) => !s.completedAt && (s.videosDone > 0 || s.lastActivity)).length;
  return html`
    <div class="kpis">
      <div class="kpi"><strong>${students.length}</strong><span>studenti iscritti</span></div>
      <div class="kpi"><strong>${active}</strong><span>in corso</span></div>
      <div class="kpi"><strong>${completed}</strong><span>hanno completato (badge)</span></div>
    </div>
    <div class="toolbar">
      <label class="sr-only" for="search">Cerca studente</label>
      <input class="input" id="search" type="search" placeholder="Cerca per nome, email o matricola">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn--primary btn--sm" href="/api/admin/export.csv" download>${icon('download')} Esporta completamenti (CSV)</a>
        <a class="btn btn--secondary btn--sm" href="/api/admin/export.csv?all=1" download>${icon('download')} Tutti gli studenti</a>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Studente</th><th>Matricola</th><th>Avanzamento</th><th>Ultima attività</th><th>Completato</th></tr></thead>
        <tbody>
          ${students.length ? students.map((s) => html`
            <tr data-search="${`${s.firstName} ${s.lastName} ${s.email} ${s.matricola}`.toLowerCase()}">
              <td><strong>${s.lastName} ${s.firstName}</strong><br><span style="color:var(--text-muted)">${s.email}</span></td>
              <td>${s.matricola}</td>
              <td><div style="display:flex;align-items:center;gap:10px"><div class="progress ${s.completedAt ? 'progress--success' : ''}"><span style="width:${(s.quizzesPassed / totalLessons) * 100}%"></span></div>${s.quizzesPassed}/${totalLessons}</div></td>
              <td>${formatDate(s.lastActivity) || '—'}</td>
              <td>${s.completedAt ? html`<span class="chip chip--success">${icon('check')} ${formatDate(s.completedAt)}</span>` : '—'}</td>
            </tr>`) : html`<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">Nessuno studente registrato.</td></tr>`}
        </tbody>
      </table>
    </div>`;
}

export async function adminView() {
  const [{ lessons }, students] = await Promise.all([api('/admin/lessons'), api('/admin/students')]);
  const view = html`
  <div class="container">
    <header class="page-head">
      <span class="eyebrow">Area docenti</span>
      <h1 style="font-size:clamp(1.8rem,3.5vw,2.6rem)">Gestione del corso</h1>
      <p>Carica i video, modifica i quiz e scarica l'elenco di chi ha completato il corso per il rilascio dell'Open Badge.</p>
    </header>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" id="tab-lessons" aria-controls="panel-lessons" aria-selected="true">${icon('sliders')} Lezioni e quiz</button>
      <button class="tab" role="tab" id="tab-students" aria-controls="panel-students" aria-selected="false">${icon('users')} Studenti</button>
    </div>
    <section id="panel-lessons" role="tabpanel" aria-labelledby="tab-lessons" class="admin-lessons">
      ${lessons.map(lessonPanel)}
    </section>
    <section id="panel-students" role="tabpanel" aria-labelledby="tab-students" hidden style="padding-bottom:96px">
      ${studentsPanel(students)}
    </section>
  </div>`;

  return {
    view,
    mount(root) {
      $$('.admin-lesson', root).forEach(bindLesson);
      const tabs = $$('[role=tab]', root);
      tabs.forEach((tab) => tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          const on = t === tab;
          t.setAttribute('aria-selected', String(on));
          $(`#${t.getAttribute('aria-controls')}`, root).hidden = !on;
        });
      }));
      $('#search', root).addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        $$('tr[data-search]', root).forEach((tr) => { tr.hidden = q && !tr.dataset.search.includes(q); });
      });
    },
  };
}

