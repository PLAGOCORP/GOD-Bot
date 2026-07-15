/**
 * Genera variables de entorno para Render Dashboard.
 * Uso: npm run render:env
 *
 * Copia la salida en Render → Environment → Add from .env
 * o pega FIREBASE_SERVICE_ACCOUNT_JSON manualmente.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const REQUIRED = [
  { key: 'NODE_ENV', hint: 'production' },
  { key: 'DISCORD_TOKEN', hint: 'Token del bot (Discord Developer Portal)' },
  { key: 'CLIENT_ID', hint: 'Application ID de Discord' },
  { key: 'CLIENT_SECRET', hint: 'OAuth2 Client Secret' },
  { key: 'SESSION_SECRET', hint: 'String aleatorio largo (sesiones web)' },
  { key: 'DASHBOARD_URL', hint: 'https://panel.botgod.pro' },
  { key: 'DOMAIN', hint: 'botgod.pro' },
  { key: 'COOKIE_SECURE', hint: '1 (obligatorio en HTTPS)' },
  { key: 'FIREBASE_SERVICE_ACCOUNT_JSON', hint: 'JSON completo del service account (ver abajo)' },
];

const RECOMMENDED = [
  { key: 'OWNER_IDS', hint: 'IDs Discord del dueño, separados por coma' },
  { key: 'INTERACTIONS_PUBLIC_KEY', hint: 'Public Key para /interactions endpoint' },
  { key: 'API_PUBLIC_URL', hint: 'https://panel.botgod.pro' },
  { key: 'PREFIX', hint: 'g!' },
  { key: 'FIREBASE_PROJECT_ID', hint: 'godbot-d5aa2' },
  { key: 'FIREBASE_STORAGE_BUCKET', hint: 'godbot-d5aa2.firebasestorage.app' },
];

const OPTIONAL = [
  { key: 'GUILD_ID', hint: 'Solo para deploy de comandos en un servidor de prueba' },
  { key: 'XAI_API_KEY', hint: 'IA Grok (módulo AI)' },
  { key: 'XAI_MODEL', hint: 'grok-4.5' },
  { key: 'LAVALINK_HOST', hint: 'Host del servidor Lavalink (música)' },
  { key: 'LAVALINK_PORT', hint: '2333' },
  { key: 'LAVALINK_PASSWORD', hint: 'Contraseña Lavalink' },
  { key: 'LAVALINK_SECURE', hint: 'true si usa wss' },
  { key: 'YOUTUBE_COOKIE', hint: 'Cookie YouTube para evitar 429 en Lavalink' },
];

const ALL_KEYS = [...REQUIRED, ...RECOMMENDED, ...OPTIONAL].map((x) => x.key);

const lines = [];
const missing = [];

for (const key of ALL_KEYS) {
  const val = process.env[key];
  if (val != null && String(val).trim() !== '') {
    lines.push(`${key}=${val}`);
  } else if (REQUIRED.some((r) => r.key === key) && key !== 'FIREBASE_SERVICE_ACCOUNT_JSON') {
    missing.push(key);
  }
}

const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS)
  : path.join(process.cwd(), 'secrets', 'godbot-sa.json');

let hasFirebaseSa = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim());
if (!hasFirebaseSa && fs.existsSync(saPath)) {
  const json = fs.readFileSync(saPath, 'utf8').trim();
  lines.push(`FIREBASE_SERVICE_ACCOUNT_JSON=${json}`);
  hasFirebaseSa = true;
  console.error('✓ Incluido FIREBASE_SERVICE_ACCOUNT_JSON desde', saPath);
} else if (!hasFirebaseSa) {
  missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
  console.error('⚠ No se encontró service account en', saPath);
  console.error('  Sube FIREBASE_SERVICE_ACCOUNT_JSON manualmente en Render.');
}

console.log('\n# ═══════════════════════════════════════════════════════');
console.log('#  GOD-Bot — Variables para Render → Environment');
console.log('# ═══════════════════════════════════════════════════════\n');

if (missing.length) {
  console.error('\n⚠ FALTAN variables obligatorias en tu .env local:');
  missing.forEach((k) => {
    const hint = REQUIRED.find((r) => r.key === k)?.hint;
    console.error(`  • ${k}${hint ? ` — ${hint}` : ''}`);
  });
  console.error('');
}

console.log('# --- OBLIGATORIAS ---');
REQUIRED.forEach(({ key, hint }) => {
  const present = lines.some((l) => l.startsWith(key + '='));
  console.log(`# ${present ? '✓' : '✗'} ${key}: ${hint}`);
});

console.log('\n# --- RECOMENDADAS ---');
RECOMMENDED.forEach(({ key, hint }) => {
  const present = lines.some((l) => l.startsWith(key + '='));
  console.log(`# ${present ? '✓' : '○'} ${key}: ${hint}`);
});

console.log('\n# --- OPCIONALES ---');
OPTIONAL.forEach(({ key, hint }) => {
  const present = lines.some((l) => l.startsWith(key + '='));
  console.log(`# ${present ? '✓' : '○'} ${key}: ${hint}`);
});

console.log('\n# --- NO DEFINIR EN RENDER ---');
console.log('# PORT — Render lo inyecta automáticamente');
console.log('# GOOGLE_APPLICATION_CREDENTIALS — usa FIREBASE_SERVICE_ACCOUNT_JSON en Render');
console.log('# DASHBOARD_DISABLED — solo para desactivar el panel');

console.log('\n# --- OAuth redirect en Discord Developer Portal ---');
console.log('# https://panel.botgod.pro/auth/callback');

console.log('\n# --- Pegar bloque .env (Add from .env) ---\n');
console.log(lines.join('\n'));
console.log('\n# Fin — tras pegar, redeploy en Render para aplicar cambios.');