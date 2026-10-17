'use strict';

const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const multer = require('multer');
const { db, transaction, replaceQuestions } = require('./db');
const config = require('./config');
const auth = require('./auth');

const router = express.Router();
router.use(auth.requireAdmin);

const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm' };

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => cb(null, `lezione-${req.params.pos}-${Date.now()}${VIDEO_TYPES[file.mimetype]}`),
  }),
  limits: { fileSize: config.maxUploadBytes },
  fileFilter: (_req, file, cb) => cb(null, Boolean(VIDEO_TYPES[file.mimetype])),
});

function lessonView(l) {
  const questions = db.prepare('SELECT * FROM questions WHERE lesson_pos = ? ORDER BY position').all(l.position)
    .map((q) => ({ text: q.text, options: JSON.parse(q.options_json), correct: q.correct_index, explanation: q.explanation }));
  return {
    position: l.position,
    title: l.title,
    description: l.description,
    videoUrl: l.video_url,
    durationSec: l.duration_sec || 0,
    passThreshold: l.pass_threshold,
    questions,
  };
}

router.get('/lessons', (_req, res) => {
  res.json({ lessons: db.prepare('SELECT * FROM lessons ORDER BY position').all().map(lessonView) });
});

function validateQuestions(raw) {
  if (!Array.isArray(raw)) return { error: 'Formato del quiz non valido.' };
  const questions = [];
  for (const [i, q] of raw.entries()) {
    const text = String(q.text ?? '').trim();
    const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? '').trim()).filter(Boolean);
    const correct = Number(q.correct);
    if (!text) return { error: `Domanda ${i + 1}: manca il testo.` };
    if (options.length < 2) return { error: `Domanda ${i + 1}: servono almeno due risposte.` };
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      return { error: `Domanda ${i + 1}: indica la risposta corretta.` };
    }
    questions.push({ text, options, correct, explanation: String(q.explanation ?? '').trim() });
  }
  return { questions };
}

router.put('/lessons/:pos', (req, res) => {
  const pos = Number(req.params.pos);
  const lesson = db.prepare('SELECT * FROM lessons WHERE position = ?').get(pos);
  if (!lesson) return res.status(404).json({ error: 'Lezione non trovata.' });

  const title = String(req.body.title ?? '').trim();
  if (!title) return res.status(400).json({ error: 'Il titolo è obbligatorio.' });
  const threshold = Number(req.body.passThreshold);
  if (!(threshold > 0 && threshold <= 1)) return res.status(400).json({ error: 'Soglia di superamento non valida.' });
  const duration = Number(req.body.durationSec) || null;
  const { questions, error } = validateQuestions(req.body.questions);
  if (error) return res.status(400).json({ error });

  transaction(() => {
    db.prepare(`UPDATE lessons SET title = ?, description = ?, video_url = ?, duration_sec = ?, pass_threshold = ?
      WHERE position = ?`).run(
      title, String(req.body.description ?? '').trim(), String(req.body.videoUrl ?? '').trim(),
      duration, threshold, pos,
    );
    replaceQuestions(pos, questions);
  });
  res.json({ lesson: lessonView(db.prepare('SELECT * FROM lessons WHERE position = ?').get(pos)) });
});

router.post('/lessons/:pos/video', (req, res) => {
  const pos = Number(req.params.pos);
  const lesson = db.prepare('SELECT * FROM lessons WHERE position = ?').get(pos);
  if (!lesson) return res.status(404).json({ error: 'Lezione non trovata.' });

  upload.single('video')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Il file supera la dimensione massima consentita.' : 'Caricamento non riuscito.';
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: 'Carica un file video MP4 o WebM.' });

    // Rimuove il video caricato in precedenza per questa lezione.
    if (lesson.video_url.startsWith('/media/')) {
      fs.rm(path.join(config.uploadsDir, path.basename(lesson.video_url)), { force: true }, () => {});
    }
    const duration = Number(req.body.durationSec) || null;
    db.prepare('UPDATE lessons SET video_url = ?, duration_sec = ? WHERE position = ?')
      .run(`/media/${req.file.filename}`, duration, pos);
    res.json({ lesson: lessonView(db.prepare('SELECT * FROM lessons WHERE position = ?').get(pos)) });
  });
});

function studentsWithProgress() {
  const total = db.prepare('SELECT COUNT(*) AS n FROM lessons').get().n;
  const rows = db.prepare(`SELECT u.id, u.email, u.first_name, u.last_name, u.matricola, u.created_at,
      u.course_completed_at,
      COALESCE(SUM(p.video_completed_at IS NOT NULL), 0) AS videos_done,
      COALESCE(SUM(p.quiz_passed_at IS NOT NULL), 0) AS quizzes_passed,
      MAX(p.last_beat_at) AS last_activity
    FROM users u LEFT JOIN progress p ON p.user_id = u.id
    WHERE u.is_admin = 0
    GROUP BY u.id ORDER BY u.last_name, u.first_name`).all();
  return { total, rows };
}

router.get('/students', (_req, res) => {
  const { total, rows } = studentsWithProgress();
  res.json({
    totalLessons: total,
    students: rows.map((r) => ({
      id: r.id, email: r.email, firstName: r.first_name, lastName: r.last_name, matricola: r.matricola,
      registeredAt: r.created_at, completedAt: r.course_completed_at,
      videosDone: r.videos_done, quizzesPassed: r.quizzes_passed, lastActivity: r.last_activity,
    })),
  });
});

const csvCell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = `'${s}`; // evita l'interpretazione come formula in Excel
  return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const isoDate = (ms) => (ms ? new Date(ms).toISOString() : '');

router.get('/export.csv', (req, res) => {
  const { total, rows } = studentsWithProgress();
  const onlyCompleted = req.query.all !== '1';
  const header = ['cognome', 'nome', 'email', 'matricola', 'video_completati', 'quiz_superati', 'lezioni_totali', 'corso_completato_il', 'registrato_il'];
  const lines = rows
    .filter((r) => !onlyCompleted || r.course_completed_at)
    .map((r) => [r.last_name, r.first_name, r.email, r.matricola, r.videos_done, r.quizzes_passed, total,
      isoDate(r.course_completed_at), isoDate(r.created_at)].map(csvCell).join(';'));
  const name = onlyCompleted ? 'completamenti-open-badge' : 'studenti-avanzamento';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [header.join(';'), ...lines].join('\r\n'));
});

module.exports = router;
