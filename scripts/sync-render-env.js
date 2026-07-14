/**
 * Genera variables de entorno para Render Dashboard.
 * Uso: node scripts/sync-render-env.js
 *
 * Copia la salida en Render → Environment → Add from .env
 * o pega FIREBASE_SERVICE_ACCOUNT_JSON manualmente.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const KEYS = [
  'NODE_ENV',
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'GUILD_ID',
  'OWNER_IDS',
  'PREFIX',
  'DOMAIN',
  'DASHBOARD_URL',
  'API_PUBLIC_URL',
  'COOKIE_SECURE',
  'SESSION_SECRET',
  'INTERACTIONS_PUBLIC_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'XAI_API_KEY',
  'XAI_MODEL',
  'LAVALINK_HOST',
  'LAVALINK_PORT',
  'LAVALINK_PASSWORD',
  'LAVALINK_SECURE',
];

const lines = [];
for (const key of KEYS) {
  const val = process.env[key];
  if (val != null && String(val).trim() !== '') {
    lines.push(`${key}=${val}`);
  }
}

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : path.join(process.cwd(), 'secrets', 'godbot-sa.json');

if (fs.existsSync(saPath)) {
  const json = fs.readFileSync(saPath, 'utf8').trim();
  lines.push(`FIREBASE_SERVICE_ACCOUNT_JSON=${json}`);
  console.error('✓ Incluido FIREBASE_SERVICE_ACCOUNT_JSON desde', saPath);
} else {
  console.error('⚠ No se encontró service account en', saPath);
  console.error('  Sube FIREBASE_SERVICE_ACCOUNT_JSON manualmente en Render.');
}

console.log('\n# --- Pegar en Render → Environment ---\n');
console.log(lines.join('\n'));
console.log('\n# Nota: Render inyecta PORT automáticamente; no lo definas.');