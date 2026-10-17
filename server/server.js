'use strict';

const path = require('node:path');
const express = require('express');
const config = require('./config');
require('./db');
const auth = require('./auth');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.json({ limit: '200kb' }));
app.use(auth.loadUser);
app.use('/api', auth.sameOrigin);
app.use('/api/admin', require('./admin'));
app.use('/api', require('./api'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Risorsa non trovata.' }));

// I video caricati sono visibili solo agli utenti registrati.
app.use('/media', auth.requireAuth, express.static(config.uploadsDir, { maxAge: '1d' }));

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? 'Richiesta non valida.' : 'Errore del server. Riprova.' });
});

auth.cleanupSessions();
setInterval(auth.cleanupSessions, 6 * 60 * 60 * 1000).unref();

app.listen(config.port, () => {
  console.log(`Sorriso in Salute in ascolto su http://localhost:${config.port}`);
  if (!config.adminEmails.length) {
    console.log('Nessun amministratore configurato: imposta ADMIN_EMAILS per accedere all\'area docenti.');
  }
});
