/**
 * Mantiene despierto el servicio en Render (plan free).
 * Ejecutar en segundo plano o con Programador de tareas / cron:
 *   node scripts/keepalive.js
 *   node scripts/keepalive.js --once
 */
require('dotenv').config();

const TARGETS = [
  process.env.DASHBOARD_URL,
  process.env.API_PUBLIC_URL,
  'https://panel.botgod.pro',
  'https://god-bot-32zr.onrender.com',
]
  .filter(Boolean)
  .map((u) => String(u).replace(/\/$/, ''));

const UNIQUE = [...new Set(TARGETS)];
const INTERVAL_MS = parseInt(process.env.KEEPALIVE_INTERVAL_MS || '240000', 10);
const ONCE = process.argv.includes('--once');

async function ping(base) {
  const url = base + '/health';
  const t0 = Date.now();
  try {
    const res = await fetch(url, { cache: 'no-store' });
    const ms = Date.now() - t0;
    const body = await res.text();
    console.log(`[${new Date().toISOString()}] ${res.status} ${url} (${ms}ms) ${body.slice(0, 80)}`);
    return res.ok;
  } catch (err) {
    console.log(`[${new Date().toISOString()}] FAIL ${url} — ${err.message}`);
    return false;
  }
}

async function tick() {
  for (const base of UNIQUE) {
    await ping(base);
  }
}

(async () => {
  await tick();
  if (!ONCE) {
    console.log(`Keep-alive activo cada ${INTERVAL_MS / 1000}s. Ctrl+C para salir.`);
    setInterval(tick, INTERVAL_MS);
  }
})();