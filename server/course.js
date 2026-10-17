'use strict';

const crypto = require('node:crypto');
const { db } = require('./db');
const config = require('./config');

// Margine di tolleranza (in secondi) per considerare il video visto fino in fondo
// e per piccoli scarti fra un aggiornamento e l'altro.
const END_TOLERANCE = 3;
const GAP_TOLERANCE = 5;

const allLessons = () => db.prepare('SELECT * FROM lessons ORDER BY position').all();
const getLesson = (pos) => db.prepare('SELECT * FROM lessons WHERE position = ?').get(pos);

function getProgress(userId, pos) {
  return db.prepare('SELECT * FROM progress WHERE user_id = ? AND lesson_pos = ?').get(userId, pos);
}

function ensureProgress(userId, pos) {
  db.prepare('INSERT OR IGNORE INTO progress (user_id, lesson_pos) VALUES (?, ?)').run(userId, pos);
  return getProgress(userId, pos);
}

/**
 * Stato di ogni lezione per un utente. Le lezioni si sbloccano in ordine:
 * la lezione N è disponibile solo dopo aver superato il quiz della N-1.
 *   locked → bloccata, video → da guardare, quiz → video visto, quiz da superare, done → completata
 */
function courseState(userId) {
  const rows = db.prepare('SELECT * FROM progress WHERE user_id = ?').all(userId);
  const byPos = new Map(rows.map((r) => [r.lesson_pos, r]));
  let previousDone = true;
  return allLessons().map((lesson) => {
    const p = byPos.get(lesson.position);
    let status = 'locked';
    if (previousDone) {
      if (p?.quiz_passed_at) status = 'done';
      else if (p?.video_completed_at) status = 'quiz';
      else status = 'video';
    }
    previousDone = status === 'done';
    const duration = lesson.duration_sec || 0;
    return {
      position: lesson.position,
      title: lesson.title,
      description: lesson.description,
      durationSec: duration,
      hasVideo: Boolean(lesson.video_url),
      status,
      watchedSec: p?.watched_until || 0,
      watchedPct: p?.video_completed_at ? 100 : duration ? Math.min(99, Math.floor(((p?.watched_until || 0) / duration) * 100)) : 0,
      bestScore: p?.best_score ?? null,
      quizPassedAt: p?.quiz_passed_at ?? null,
    };
  });
}

/**
 * Registra un tratto di video guardato [from, to]. Viene accreditato solo se
 * prosegue il tratto già visto in modo continuo e solo per quanti secondi
 * possono essere trascorsi davvero dall'ultimo aggiornamento.
 */
function recordWatch(userId, lesson, { from, to, duration }) {
  const now = Date.now();
  let total = lesson.duration_sec;
  if (!total && duration >= 60) {
    // Durata non ancora impostata dal docente: si usa quella letta dal player.
    db.prepare('UPDATE lessons SET duration_sec = ? WHERE position = ? AND duration_sec IS NULL')
      .run(duration, lesson.position);
    total = duration;
  }
  const p = ensureProgress(userId, lesson.position);
  let watched = p.watched_until;

  if (total && !p.video_completed_at && from <= watched + GAP_TOLERANCE && to > watched) {
    const elapsedSec = p.last_beat_at ? (now - p.last_beat_at) / 1000 : 15;
    const maxGain = elapsedSec * config.maxPlaybackRate;
    watched = Math.min(to, watched + maxGain, total);
  }

  const completed = p.video_completed_at || (total && watched >= total - END_TOLERANCE ? now : null);
  db.prepare(`UPDATE progress SET watched_until = ?, last_beat_at = ?, video_completed_at = ?
    WHERE user_id = ? AND lesson_pos = ?`).run(watched, now, completed, userId, lesson.position);

  return { watchedSec: watched, completed: Boolean(completed), durationSec: total || 0 };
}

/**
 * Ordine delle risposte mescolato in modo stabile per ogni studente, così la
 * sequenza delle risposte corrette non si può passare da uno studente all'altro.
 * Restituisce order[posizioneMostrata] = indiceOriginale.
 */
function optionOrder(userId, question) {
  const n = JSON.parse(question.options_json).length;
  const order = [...Array(n).keys()];
  const seed = crypto.createHash('sha256').update(`${userId}:${question.id}`).digest();
  for (let i = n - 1; i > 0; i--) {
    const j = seed[i % seed.length] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

const lessonQuestions = (pos) =>
  db.prepare('SELECT * FROM questions WHERE lesson_pos = ? ORDER BY position').all(pos);

function publicQuestions(pos, userId) {
  return lessonQuestions(pos).map((q) => {
    const options = JSON.parse(q.options_json);
    return { id: q.id, text: q.text, options: optionOrder(userId, q).map((i) => options[i]) };
  });
}

function gradeQuiz(userId, lesson, answers) {
  const questions = lessonQuestions(lesson.position);
  const orders = questions.map((q) => optionOrder(userId, q));
  // Posizione (nell'ordine mostrato allo studente) della risposta corretta.
  const correctShown = questions.map((q, i) => orders[i].indexOf(q.correct_index));
  const total = questions.length;
  const score = questions.reduce((acc, _q, i) => acc + (answers[i] === correctShown[i] ? 1 : 0), 0);
  const passed = total === 0 || score / total >= lesson.pass_threshold - 1e-9;
  const now = Date.now();
  const p = ensureProgress(userId, lesson.position);

  db.prepare(`INSERT INTO quiz_attempts (user_id, lesson_pos, score, total, passed, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(userId, lesson.position, score, total, passed ? 1 : 0, now);
  const ratio = total ? score / total : 1;
  db.prepare(`UPDATE progress SET attempts = attempts + 1,
      best_score = MAX(COALESCE(best_score, 0), ?),
      quiz_passed_at = COALESCE(quiz_passed_at, ?)
    WHERE user_id = ? AND lesson_pos = ?`)
    .run(ratio, passed ? now : null, userId, lesson.position);

  let courseCompleted = false;
  if (passed) {
    courseCompleted = courseState(userId).every((l) => l.status === 'done');
    if (courseCompleted) {
      db.prepare('UPDATE users SET course_completed_at = COALESCE(course_completed_at, ?) WHERE id = ?').run(now, userId);
    }
  }

  return {
    score, total, passed, courseCompleted,
    attempts: p.attempts + 1,
    // Le soluzioni vengono mostrate solo a quiz superato, per non rendere banale il nuovo tentativo.
    review: passed
      ? questions.map((q, i) => ({ correct: correctShown[i], given: answers[i] ?? null, explanation: q.explanation }))
      : null,
  };
}

module.exports = { allLessons, getLesson, getProgress, courseState, recordWatch, publicQuestions, gradeQuiz };
