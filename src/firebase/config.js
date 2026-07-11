/**
 * Config Firebase del proyecto Godbot (godbot-d5aa2)
 * Valores sensibles van en .env — la apiKey web es "pública" pero debe restringirse por dominio en GCP.
 */
require('dotenv').config();

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'godbot-d5aa2.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'godbot-d5aa2',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'godbot-d5aa2.firebasestorage.app',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '135271463932',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
};

function isConfigured() {
  return Boolean(firebaseConfig.projectId && (firebaseConfig.apiKey || process.env.GOOGLE_APPLICATION_CREDENTIALS));
}

/** Config segura para inyectar en el frontend (misma que Firebase console) */
function clientConfig() {
  return { ...firebaseConfig };
}

module.exports = {
  firebaseConfig,
  isConfigured,
  clientConfig,
  projectNumber: process.env.FIREBASE_PROJECT_NUMBER || '135271463932',
  supportEmail: process.env.SUPPORT_EMAIL || 'plago1806@gmail.com',
};
