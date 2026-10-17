'use strict';

const path = require('node:path');

const list = (value, fallback) =>
  (value ?? fallback).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = {
  port: Number(process.env.PORT) || 3000,
  dataDir,
  uploadsDir: path.join(dataDir, 'uploads'),
  adminEmails: list(process.env.ADMIN_EMAILS, ''),
  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS, 'studenti.unimi.it,unimi.it'),
  cookieSecure: process.env.COOKIE_SECURE === '1',
  sessionDays: 30,
  // Velocità massima di riproduzione accettata: il server non accredita più
  // secondi di video di quanti ne possano scorrere in tempo reale a questa velocità.
  maxPlaybackRate: 2,
  maxUploadBytes: 4 * 1024 ** 3,
};
