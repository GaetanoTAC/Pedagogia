'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const config = require('./config');

fs.mkdirSync(config.uploadsDir, { recursive: true });

const db = new DatabaseSync(path.join(config.dataDir, 'corso.sqlite'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id                  INTEGER PRIMARY KEY,
    email               TEXT NOT NULL UNIQUE,
    first_name          TEXT NOT NULL,
    last_name           TEXT NOT NULL,
    matricola           TEXT NOT NULL DEFAULT '',
    password_hash       TEXT NOT NULL,
    is_admin            INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL,
    course_completed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS lessons (
    position       INTEGER PRIMARY KEY,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    video_url      TEXT NOT NULL DEFAULT '',
    duration_sec   REAL,
    pass_threshold REAL NOT NULL DEFAULT 0.75
  );

  CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY,
    lesson_pos    INTEGER NOT NULL REFERENCES lessons(position) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    text          TEXT NOT NULL,
    options_json  TEXT NOT NULL,
    correct_index INTEGER NOT NULL,
    explanation   TEXT NOT NULL DEFAULT ''
  );

  -- watched_until: secondi del video visti in modo continuo dall'inizio.
  CREATE TABLE IF NOT EXISTS progress (
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_pos         INTEGER NOT NULL REFERENCES lessons(position) ON DELETE CASCADE,
    watched_until      REAL NOT NULL DEFAULT 0,
    last_beat_at       INTEGER,
    video_completed_at INTEGER,
    quiz_passed_at     INTEGER,
    best_score         REAL,
    attempts           INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, lesson_pos)
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_pos INTEGER NOT NULL,
    score      INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    passed     INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function replaceQuestions(lessonPos, questions) {
  db.prepare('DELETE FROM questions WHERE lesson_pos = ?').run(lessonPos);
  const insert = db.prepare(`INSERT INTO questions
    (lesson_pos, position, text, options_json, correct_index, explanation)
    VALUES (?, ?, ?, ?, ?, ?)`);
  questions.forEach((q, i) => {
    insert.run(lessonPos, i + 1, q.text, JSON.stringify(q.options), q.correct, q.explanation || '');
  });
}

function seedIfEmpty() {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM lessons').get();
  if (n > 0) return;
  const course = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'course.json'), 'utf8'));
  transaction(() => {
    const insert = db.prepare(`INSERT INTO lessons (position, title, description, pass_threshold)
      VALUES (?, ?, ?, ?)`);
    course.lessons.forEach((lesson, i) => {
      insert.run(i + 1, lesson.title, lesson.description, course.passThreshold);
      replaceQuestions(i + 1, lesson.questions);
    });
  });
  console.log(`Database inizializzato con ${course.lessons.length} lezioni.`);
}

seedIfEmpty();

module.exports = { db, transaction, replaceQuestions };
