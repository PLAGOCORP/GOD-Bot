/**
 * Estado de salud del servicio (bot, Firestore, Lavalink, proceso).
 */
const config = require('../config');
const db = require('../database/db');
const lavalink = require('../modules/lavalink');

const STARTED_AT = Date.now();

async function checkFirestore() {
  const start = Date.now();
  try {
    await db.ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e) {
    return { ok: false, error: e.message, latencyMs: Date.now() - start };
  }
}

function checkLavalink() {
  const configured = Boolean(config.lavalink?.host);
  if (!configured) {
    return { configured: false, ok: null, status: 'disabled' };
  }
  const ready = lavalink.isReady();
  return {
    configured: true,
    ok: ready,
    status: ready ? 'connected' : 'disconnected',
    host: config.lavalink.host,
    port: config.lavalink.port,
  };
}

function checkDiscord(client) {
  const ready = Boolean(client?.isReady?.() ?? client?.ws?.status === 0);
  return {
    ok: ready,
    status: ready ? 'ready' : (client ? 'connecting' : 'offline'),
    guilds: client?.guilds?.cache?.size || 0,
    users: client
      ? client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0)
      : 0,
    ping: client ? Math.round(client.ws.ping) : null,
    uptimeMs: client?.uptime || 0,
  };
}

/**
 * @param {import('discord.js').Client|null} client
 * @param {{ includePrivate?: boolean }} [opts]
 */
async function getHealthStatus(client, opts = {}) {
  const [firestore] = await Promise.all([checkFirestore()]);
  const discord = checkDiscord(client);
  const lavalinkStatus = checkLavalink();

  const services = {
    api: { ok: true, status: 'up' },
    discord,
    firestore,
    lavalink: lavalinkStatus,
  };

  const criticalOk = services.api.ok && services.firestore.ok;
  const fullyHealthy = criticalOk && discord.ok;

  const base = {
    ok: criticalOk,
    healthy: fullyHealthy,
    status: fullyHealthy ? 'operational' : criticalOk ? 'degraded' : 'down',
    timestamp: new Date().toISOString(),
    version: config.bot.version,
    domain: config.domain,
    uptime: {
      processMs: Math.round(process.uptime() * 1000),
      serverMs: Date.now() - STARTED_AT,
      botMs: discord.uptimeMs,
    },
    services,
  };

  if (opts.includePrivate) {
    base.env = {
      nodeEnv: config.nodeEnv,
      dashboardUrl: config.dashboardUrl,
      cookieSecure: config.cookieSecure,
      lavalinkConfigured: lavalinkStatus.configured,
      firebaseConfigured: Boolean(
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS
      ),
    };
  } else {
    base.guilds = discord.guilds;
    base.ready = discord.ok;
  }

  return base;
}

module.exports = { getHealthStatus, STARTED_AT };