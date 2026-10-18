# Smile Up

*La salute orale inizia da te.*

Un'iniziativa di AISO Milano Statale (Associazione Italiana Studenti di Odontoiatria).

Mini-corso online sulla salute orale per gli studenti dell'Università degli Studi di Milano.

- **10 videolezioni** che si sbloccano in ordine.
- **Tracciamento della visione lato server**: una lezione risulta completata solo se il video è stato guardato dall'inizio alla fine.
- **Quiz dopo ogni video**, corretti dal server. Superato il quiz si sblocca la lezione successiva.
- **Area docenti** per caricare i video, modificare i quiz e scaricare l'elenco di chi ha completato il corso (CSV), da usare per il rilascio dell'**Open Badge**.

## Avvio rapido

Serve Node.js 22.13 o successivo. Non serve un database esterno: il sito usa SQLite, già incluso in Node.

```bash
npm install
cp .env.example .env      # poi imposta almeno ADMIN_EMAILS
npm start                 # http://localhost:3000
```

Al primo avvio il database viene creato in `data/` con le 10 lezioni e i quiz presi da `content/course.json`.

## Configurazione (`.env`)

| Variabile | Descrizione |
|---|---|
| `PORT` | Porta HTTP (predefinita 3000). |
| `ADMIN_EMAILS` | Email dei docenti, separate da virgola. Chi si registra o accede con una di queste email ottiene l'area **Gestione**. |
| `ALLOWED_EMAIL_DOMAINS` | Domini ammessi alla registrazione (predefinito `studenti.unimi.it,unimi.it`). |
| `COOKIE_SECURE` | `1` quando il sito è in HTTPS (consigliato in produzione). |
| `DATA_DIR` | Cartella del database e dei video caricati (predefinita `./data`). **Va inclusa nei backup.** |

## Uso da parte del docente

1. Registrati con un'email presente in `ADMIN_EMAILS` e apri **Gestione**.
2. Per ogni lezione puoi:
   - **caricare il video** (MP4 H.264 o WebM). La durata viene letta in automatico;
   - in alternativa, indicare l'**URL di un file MP4** ospitato altrove. Servono file video diretti: YouTube o Vimeo non funzionano, perché non permettono di controllare l'avanzamento;
   - modificare titolo, descrizione, domande, risposte, risposta corretta, spiegazione e soglia di superamento (predefinita 75%).
3. Nella scheda **Studenti** vedi l'avanzamento di tutti. Da lì puoi scaricare:
   - **Esporta completamenti (CSV)**: chi ha finito tutto, con data di completamento, cioè l'elenco per il rilascio del badge;
   - **Tutti gli studenti**: l'avanzamento completo.

> Le domande in `content/course.json` sono una **bozza da validare**: rivedile dall'area Gestione prima di aprire il corso.

## Come viene verificata la visione

- Durante la riproduzione il browser invia al server, ogni 8 secondi, il tratto di video appena visto.
- Il server accredita solo i tratti che **proseguono** quanto già visto, quindi non si può saltare in avanti. Accredita al massimo i secondi che possono essere passati davvero dall'ultimo aggiornamento, alla velocità massima di 2×.
- Il player impedisce di spostarsi oltre il punto già visto e limita la velocità a 2×. Rivedere le parti già viste è sempre possibile.
- Il quiz si sblocca solo a video completato. Le risposte corrette non vengono mai inviate al browser prima del superamento. L'ordine delle risposte è mescolato in modo diverso per ogni studente.
- Il corso risulta completato quando tutti i quiz sono superati. La data viene salvata ed esportata nel CSV.

## Pubblicazione

Il sito è un unico processo Node, da mettere dietro un reverse proxy HTTPS (ad esempio nginx). Con Docker:

```bash
docker build -t smile-up .
docker run -d -p 3000:3000 -v sorriso-data:/app/data \
  -e ADMIN_EMAILS=docente@unimi.it -e COOKIE_SECURE=1 smile-up
```

Con 10 video da 20 minuti servono alcuni GB di spazio per `data/uploads`. Il caricamento accetta file fino a 4 GB. Se usi nginx, alza `client_max_body_size`.

## Da completare prima della pubblicazione

- Sostituire il testo di esempio della pagina **Privacy** con l'informativa ufficiale dell'Ateneo.
- Validare i quiz.
- Concordare con l'ufficio che rilascia gli Open Badge il formato del CSV.
- Valutare, se richiesto dall'Ateneo, l'accesso con le credenziali istituzionali (SSO) al posto della registrazione con email e password.
- Valutare la verifica dell'email in fase di registrazione: oggi non è presente, quindi il dominio dell'email è controllato ma non la proprietà della casella.

## Struttura

```
server/          API (Express) e database SQLite
  api.js         registrazione, accesso, corso, avanzamento video, quiz
  admin.js       area docenti, caricamento video, esportazione CSV
  course.js      regole di sblocco, verifica della visione, correzione dei quiz
public/          interfaccia (HTML, CSS e JavaScript senza build)
  assets/js/scene3d.js   mondo 3D della home (dente, spazzolino, arcata)
  assets/models/         modelli 3D generati da tools/build_models.py
  assets/vendor/         three.js r128 (licenza MIT), incluso per non dipendere da CDN esterne
content/         contenuti iniziali del corso
tools/           script per rigenerare i modelli 3D (Python: numpy, scipy, scikit-image)
```
