const db = require('../database/db');

const TYPE_META = {
  dashboard_settings: { category: 'config', label: 'Configuración' },
  dashboard_modules: { category: 'module', label: 'Módulos' },
  dashboard_automod: { category: 'security', label: 'AutoMod' },
  dashboard_tags: { category: 'config', label: 'Tags' },
  dashboard_verification: { category: 'config', label: 'Verificación' },
  dashboard_warn: { category: 'moderation', label: 'Warn' },
  dashboard_kick: { category: 'moderation', label: 'Kick' },
  dashboard_ban: { category: 'moderation', label: 'Ban' },
  dashboard_timeout: { category: 'moderation', label: 'Timeout' },
  dashboard_clearwarns: { category: 'moderation', label: 'Limpiar warns' },
};

function getMeta(type) {
  return TYPE_META[type] || { category: 'config', label: type || 'Cambio' };
}

function summarizeSettings(body) {
  if (!body || typeof body !== 'object') return 'Configuración actualizada';
  const keys = Object.keys(body).filter((k) => !k.startsWith('_') && body[k] !== undefined && body[k] !== '');
  if (!keys.length) return 'Configuración actualizada';
  if (keys.length <= 4) {
    return keys.map((k) => `${k}: ${String(body[k]).slice(0, 40)}`).join(' · ');
  }
  return `Actualizó ${keys.length} campos (${keys.slice(0, 4).join(', ')}…)`;
}

function summarizeModules(modules) {
  if (!modules || typeof modules !== 'object') return 'Módulos actualizados';
  const changes = Object.entries(modules).map(([m, on]) => `${m} → ${on ? 'ON' : 'OFF'}`);
  if (changes.length <= 6) return changes.join(' · ');
  return `${changes.length} módulos modificados`;
}

function summarizeAutomod(body) {
  const parts = [];
  if (body.enabled != null) parts.push(`AutoMod ${body.enabled ? 'activado' : 'desactivado'}`);
  const cfgKeys = Object.keys(body).filter((k) => k !== 'enabled');
  if (cfgKeys.length) parts.push(`campos: ${cfgKeys.join(', ')}`);
  return parts.join(' · ') || 'AutoMod actualizado';
}

function summarizeTags(action, name) {
  if (action === 'delete') return `Eliminó tag "${name}"`;
  if (action === 'add') return `Creó tag "${name}"`;
  return `Tag "${name}" actualizado`;
}

function defaultSummary(log) {
  const d = log.details_json || {};
  if (d.summary) return d.summary;
  if (d.reason) return d.reason;
  if (log.target_id) return `Usuario ${log.target_id}`;
  return getMeta(log.type).label;
}

async function recordAudit(guildId, adminId, type, { targetId, summary, details = {} } = {}) {
  await db.insertLog(guildId, type, {
    userId: adminId,
    targetId: targetId || null,
    details: { summary: summary || getMeta(type).label, ...details },
  });
}

async function listAuditLogs(client, guildId, { category, admin, days = 30, page = 1, limit = 25 } = {}) {
  const adminDb = require('firebase-admin');
  const fDb = adminDb.firestore();
  const snap = await fDb
    .collection('logs')
    .where('guild_id', '==', guildId)
    .orderBy('timestamp', 'desc')
    .limit(400)
    .get();

  let logs = snap.docs.map((d) => d.data()).filter((l) => l.type && l.type.startsWith('dashboard_'));

  const dayNum = parseInt(days, 10);
  if (dayNum > 0) {
    const since = Date.now() - dayNum * 86_400_000;
    logs = logs.filter((l) => l.timestamp >= since);
  }

  if (category) {
    logs = logs.filter((l) => getMeta(l.type).category === category);
  }

  if (admin && admin.trim()) {
    const q = admin.trim().toLowerCase();
    logs = logs.filter((l) => l.user_id === q || String(l.user_id || '').includes(q));
  }

  const stats = {
    total: logs.length,
    admins: new Set(logs.map((l) => l.user_id).filter(Boolean)).size,
    security: logs.filter((l) => ['security', 'moderation'].includes(getMeta(l.type).category)).length,
    modules: logs.filter((l) => l.type === 'dashboard_modules').length,
  };

  const total = logs.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const pageNum = Math.min(Math.max(1, parseInt(page, 10) || 1), pages);
  const slice = logs.slice((pageNum - 1) * limit, pageNum * limit);

  const enriched = await Promise.all(
    slice.map(async (log) => {
      let adminName = log.user_id || 'Sistema';
      if (log.user_id && client) {
        const u = await client.users.fetch(log.user_id).catch(() => null);
        if (u) adminName = u.globalName || u.username;
      }
      const meta = getMeta(log.type);
      const details = log.details_json || {};
      return {
        id: log.id,
        timestamp: log.timestamp,
        adminId: log.user_id,
        adminName,
        targetId: log.target_id,
        type: log.type,
        category: meta.category,
        label: meta.label,
        summary: defaultSummary(log),
        details,
      };
    })
  );

  return { logs: enriched, stats, total, page: pageNum, pages, limit };
}

module.exports = {
  recordAudit,
  listAuditLogs,
  summarizeSettings,
  summarizeModules,
  summarizeAutomod,
  summarizeTags,
  getMeta,
};