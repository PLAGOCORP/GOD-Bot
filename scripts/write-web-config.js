/**
 * Genera web/public/config.js desde .env
 * Uso: node scripts/write-web-config.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'web', 'public', 'config.js');
const clientId = process.env.CLIENT_ID || '';
const apiBase = process.env.API_PUBLIC_URL || process.env.DASHBOARD_URL || '';
const content = `/** Generado por scripts/write-web-config.js — no editar a mano si usas el script */
window.GOD_SITE = {
  clientId: ${JSON.stringify(clientId === 'tu_client_id_aqui' ? '' : clientId)},
  apiBase: ${JSON.stringify(apiBase.includes('localhost') ? '' : apiBase)},
  dashboardUrl: ${JSON.stringify(apiBase.includes('localhost') ? '' : apiBase)},
};
window.FIREBASE_CONFIG = {
  apiKey: ${JSON.stringify(process.env.FIREBASE_API_KEY || '')},
  authDomain: ${JSON.stringify(process.env.FIREBASE_AUTH_DOMAIN || 'godbot-d5aa2.firebaseapp.com')},
  projectId: ${JSON.stringify(process.env.FIREBASE_PROJECT_ID || 'godbot-d5aa2')},
  storageBucket: ${JSON.stringify(process.env.FIREBASE_STORAGE_BUCKET || '')},
  messagingSenderId: ${JSON.stringify(process.env.FIREBASE_MESSAGING_SENDER_ID || '')},
  appId: ${JSON.stringify(process.env.FIREBASE_APP_ID || '')},
  measurementId: ${JSON.stringify(process.env.FIREBASE_MEASUREMENT_ID || '')},
};
`;
fs.writeFileSync(out, content, 'utf8');
console.log('Wrote', out);
