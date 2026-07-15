const db = require('../database/db');
const confessions = require('../modules/confessions');
const embeds = require('../utils/embeds');
const auditLog = require('./auditLog');

async function listConfessions(guildId, { status = 'pending', page = 1, limit = 10 } = {}) {
  const all = await db.listConfessions(guildId, status || null);
  all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const pageNum = Math.min(Math.max(1, parseInt(page, 10) || 1), pages);
  const slice = all.slice((pageNum - 1) * limit, pageNum * limit);

  return {
    confessions: slice.map((c) => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      status: c.status,
      preview: String(c.content || '').slice(0, 280),
    })),
    total,
    page: pageNum,
    pages,
    limit,
  };
}

async function moderateConfession(client, guildId, confessionId, action, modUserId) {
  const row = await db.getConfession(confessionId);
  if (!row || row.guild_id !== guildId) throw new Error('Confesión no encontrada');
  if (row.status !== 'pending') throw new Error('Esta confesión ya fue procesada');

  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error('Servidor no encontrado');

  const mod = await client.users.fetch(modUserId).catch(() => ({ username: String(modUserId) }));

  if (action === 'reject') {
    await confessions.setStatus(confessionId, 'rejected', modUserId, null, mod.username || modUserId);
    await auditLog.recordAudit(guildId, modUserId, 'dashboard_settings', {
      summary: `Confesión #${confessionId} rechazada`,
      details: { confessionId, action: 'reject' },
    });
    return { message: 'Confesión rechazada' };
  }

  if (action === 'approve') {
    const settings = await db.getGuildSettings(guildId);
    const pub = settings.confessionChannel
      ? guild.channels.cache.get(settings.confessionChannel)
      : null;
    if (!pub) throw new Error('Configura el canal de confesiones antes de publicar');

    const msg = await pub.send({
      embeds: [
        embeds
          .god(`💭 Confesión #${confessionId}`, row.content)
          .setFooter({ text: 'Anónima · moderada vía panel God' }),
      ],
    });
    await confessions.setStatus(confessionId, 'published', modUserId, msg.id, mod.username || modUserId);
    await auditLog.recordAudit(guildId, modUserId, 'dashboard_settings', {
      summary: `Confesión #${confessionId} publicada`,
      details: { confessionId, action: 'approve', messageId: msg.id },
    });
    return { message: 'Confesión publicada en el canal' };
  }

  throw new Error('Acción no válida');
}

module.exports = { listConfessions, moderateConfession };