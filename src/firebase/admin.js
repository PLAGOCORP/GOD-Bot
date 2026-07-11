/**
 * Firebase Admin SDK — servidor (bot)
 * Requiere service account JSON o Application Default Credentials.
 *
 * 1. Firebase Console → Project settings → Service accounts → Generate new private key
 * 2. Guarda el JSON fuera del git, ej: secrets/godbot-sa.json
 * 3. GOOGLE_APPLICATION_CREDENTIALS=./secrets/godbot-sa.json
 */
const logger = require('../utils/logger');
const { firebaseConfig, isConfigured } = require('./config');

let app = null;
let db = null;
let bucket = null;
let ready = false;

function init() {
  if (ready) return true;
  if (!isConfigured() && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    logger.info('Firebase Admin: no configurado (opcional). SQLite local sigue activo.');
    return false;
  }

  try {
    const admin = require('firebase-admin');
    if (admin.apps.length) {
      app = admin.app();
    } else {
      const opts = {
        projectId: firebaseConfig.projectId || 'godbot-d5aa2',
        storageBucket: firebaseConfig.storageBucket || undefined,
      };
      // Credenciales: GOOGLE_APPLICATION_CREDENTIALS o FIREBASE_SERVICE_ACCOUNT_JSON
      if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        admin.initializeApp({
          credential: admin.credential.cert(sa),
          ...opts,
        });
      } else {
        admin.initializeApp(opts);
      }
      app = admin.app();
    }
    db = admin.firestore();
    try {
      bucket = admin.storage().bucket();
    } catch {
      bucket = null;
    }
    ready = true;
    logger.info(`Firebase Admin listo · proyecto ${firebaseConfig.projectId}`);
    return true;
  } catch (err) {
    logger.warn('Firebase Admin no disponible:', err.message);
    return false;
  }
}

function firestore() {
  if (!ready) init();
  return db;
}

function storageBucket() {
  if (!ready) init();
  return bucket;
}

/**
 * Publica stats para la landing (documento público)
 */
async function publishPublicStats({ guilds, users, ping, version }) {
  const f = firestore();
  if (!f) return false;
  await f.doc('public/stats').set(
    {
      guilds: guilds || 0,
      users: users || 0,
      ping: ping ?? null,
      version: version || null,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return true;
}

/**
 * Backup de settings de un guild a Firestore
 */
async function backupGuildSettings(guildId, settings, modules) {
  const f = firestore();
  if (!f) return false;
  await f.doc(`guilds/${guildId}`).set(
    {
      settings: settings || {},
      modules: modules || {},
      updatedAt: Date.now(),
    },
    { merge: true }
  );
  return true;
}

/**
 * Sube transcript HTML a Storage
 * @returns {string|null} public/download URL o path
 */
async function uploadTranscript(guildId, ticketId, localPath) {
  const b = storageBucket();
  if (!b) return null;
  const dest = `transcripts/${guildId}/ticket-${ticketId}-${Date.now()}.html`;
  await b.upload(localPath, {
    destination: dest,
    metadata: { contentType: 'text/html; charset=utf-8' },
  });
  return `gs://${b.name}/${dest}`;
}

module.exports = {
  init,
  firestore,
  storageBucket,
  publishPublicStats,
  backupGuildSettings,
  uploadTranscript,
  isReady: () => ready,
};
