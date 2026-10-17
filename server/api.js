'use strict';

const express = require('express');
const { db } = require('./db');
const config = require('./config');
const auth = require('./auth');
const course = require('./course');

const router = express.Router();

const authLimiter = auth.rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const clean = (v, max = 120) => String(v ?? '').trim().slice(0, max);

function userView(u) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    matricola: u.matricola,
    isAdmin: Boolean(u.is_admin),
    courseCompletedAt: u.course_completed_at,
  };
}

function syncAdminFlag(user) {
  const shouldBeAdmin = config.adminEmails.includes(user.email) ? 1 : 0;
  if (shouldBeAdmin && !user.is_admin) {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(user.id);
    user.is_admin = 1;
  }
}

// ---------- Autenticazione ----------

router.post('/auth/register', authLimiter, (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase();
  const firstName = clean(req.body.firstName, 80);
  const lastName = clean(req.body.lastName, 80);
  const matricola = clean(req.body.matricola, 20);
  const password = String(req.body.password ?? '');
  const errors = {};

  const domain = email.split('@')[1] || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Inserisci un indirizzo email valido.';
  else if (config.allowedEmailDomains.length && !config.allowedEmailDomains.includes(domain)) {
    errors.email = `Usa la tua email istituzionale (@${config.allowedEmailDomains[0]}).`;
  }
  if (!firstName) errors.firstName = 'Inserisci il nome.';
  if (!lastName) errors.lastName = 'Inserisci il cognome.';
  if (!/^[0-9A-Za-z]{4,20}$/.test(matricola)) errors.matricola = 'Inserisci il numero di matricola.';
  if (password.length < 8) errors.password = 'La password deve avere almeno 8 caratteri.';
  if (!req.body.consent) errors.consent = 'Serve il consenso al trattamento dei dati per il rilascio del badge.';
  if (Object.keys(errors).length) return res.status(400).json({ error: 'Controlla i campi evidenziati.', fields: errors });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Esiste già un account con questa email.', fields: { email: 'Email già registrata: prova ad accedere.' } });
  }

  const { lastInsertRowid } = db.prepare(`INSERT INTO users
    (email, first_name, last_name, matricola, password_hash, is_admin, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    email, firstName, lastName, matricola, auth.hashPassword(password),
    config.adminEmails.includes(email) ? 1 : 0, Date.now(),
  );
  auth.startSession(res, Number(lastInsertRowid));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
  res.status(201).json({ user: userView(user) });
});

router.post('/auth/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 200).toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !auth.verifyPassword(String(req.body.password ?? ''), user.password_hash)) {
    return res.status(401).json({ error: 'Email o password non corretti.' });
  }
  syncAdminFlag(user);
  auth.startSession(res, user.id);
  res.json({ user: userView(user) });
});

router.post('/auth/logout', (req, res) => {
  auth.endSession(req, res);
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  res.json({
    user: req.user ? userView(req.user) : null,
    config: { emailDomain: config.allowedEmailDomains[0] || 'unimi.it' },
  });
});

// ---------- Corso ----------

router.get('/course/public', (_req, res) => {
  res.json({
    lessons: course.allLessons().map((l) => ({
      position: l.position, title: l.title, description: l.description, durationSec: l.duration_sec || 0,
    })),
  });
});

router.get('/course', auth.requireAuth, (req, res) => {
  res.json({ lessons: course.courseState(req.user.id), user: userView(req.user) });
});

/** Trova la lezione e verifica che sia sbloccata per l'utente. */
function unlockedLesson(req, res) {
  const pos = Number(req.params.pos);
  const lesson = Number.isInteger(pos) ? course.getLesson(pos) : null;
  if (!lesson) {
    res.status(404).json({ error: 'Lezione non trovata.' });
    return null;
  }
  const state = course.courseState(req.user.id).find((l) => l.position === pos);
  if (state.status === 'locked') {
    res.status(403).json({ error: 'Completa prima la lezione precedente.' });
    return null;
  }
  return { lesson, state };
}

router.get('/lessons/:pos', auth.requireAuth, (req, res) => {
  const found = unlockedLesson(req, res);
  if (!found) return;
  const { lesson, state } = found;
  res.json({
    lesson: { ...state, videoUrl: lesson.video_url, questionCount: course.publicQuestions(lesson.position, req.user.id).length },
    total: course.allLessons().length,
  });
});

router.post('/lessons/:pos/progress', auth.requireAuth, (req, res) => {
  const found = unlockedLesson(req, res);
  if (!found) return;
  const from = Number(req.body.from);
  const to = Number(req.body.to);
  const duration = Number(req.body.duration) || 0;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from) {
    return res.status(400).json({ error: 'Dati di avanzamento non validi.' });
  }
  res.json(course.recordWatch(req.user.id, found.lesson, { from, to, duration }));
});

router.get('/lessons/:pos/quiz', auth.requireAuth, (req, res) => {
  const found = unlockedLesson(req, res);
  if (!found) return;
  if (found.state.status === 'video') {
    return res.status(403).json({ error: 'Guarda il video fino alla fine per sbloccare il quiz.' });
  }
  res.json({
    lesson: found.state,
    passThreshold: found.lesson.pass_threshold,
    questions: course.publicQuestions(found.lesson.position, req.user.id),
  });
});

router.post('/lessons/:pos/quiz', auth.requireAuth, (req, res) => {
  const found = unlockedLesson(req, res);
  if (!found) return;
  if (found.state.status === 'video') {
    return res.status(403).json({ error: 'Guarda il video fino alla fine per sbloccare il quiz.' });
  }
  const answers = Array.isArray(req.body.answers) ? req.body.answers.map((a) => (Number.isInteger(a) ? a : null)) : [];
  res.json(course.gradeQuiz(req.user.id, found.lesson, answers));
});

module.exports = router;
