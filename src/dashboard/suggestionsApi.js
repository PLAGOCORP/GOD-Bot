const db = require('../database/db');
const auditLog = require('./auditLog');

async function listSuggestions(client, guildId, { status = 'pending', page = 1, limit = 10 } = {}) {
  const all = await db.listSuggestions(guildId, status || null);
  all.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const pageNum = Math.min(Math.max(1, parseInt(page, 10) || 1), pages);
  const slice = all.slice((pageNum - 1) * limit, pageNum * limit);

  const suggestions = await Promise.all(
    slice.map(async (s) => {
      let authorName = s.user_id || 'Usuario';
      if (s.user_id && client) {
        const u = await client.users.fetch(s.user_id).catch(() => null);
        if (u) authorName = u.globalName || u.username;
      }
      return {
        id: s.id,
        content: s.content,
        createdAt: s.created_at,
        status: s.status,
        userId: s.user_id,
        authorName,
        messageId: s.message_id,
        channelId: s.channel_id,
        preview: String(s.content || '').slice(0, 280),
      };
    })
  );

  return { suggestions, total, page: pageNum, pages, limit };
}

async function moderateSuggestion(client, guildId, suggestionId, action, modUserId) {
  const row = await db.getSuggestion(suggestionId);
  if (!row || row.guild_id !== guildId) throw new Error('Sugerencia no encontrada');
  if (row.status !== 'pending') throw new Error('Esta sugerencia ya fue procesada');

  const status = action === 'approve' ? 'approved' : 'denied';
  const mod = await client.users.fetch(modUserId).catch(() => ({ username: String(modUserId) }));

  if (row.message_id && row.channel_id) {
    const ch = await client.channels.fetch(row.channel_id).catch(() => null);
    const msg = ch ? await ch.messages.fetch(row.message_id).catch(() => null) : null;
    if (msg) {
      const label = status === 'approved'
        ? `✅ Aprobada por ${mod.username || modUserId}`
        : `❌ Rechazada por ${mod.username || modUserId}`;
      await msg.edit({ content: label, components: [] }).catch(() => {});
    }
  }

  await db.updateSuggestion(suggestionId, {
    status,
    reviewed_by: modUserId,
    reviewed_at: Date.now(),
  });

  await auditLog.recordAudit(guildId, modUserId, 'dashboard_settings', {
    summary: `Sugerencia #${suggestionId} ${status === 'approved' ? 'aprobada' : 'rechazada'}`,
    details: { suggestionId, action, status },
  });

  return {
    message: status === 'approved' ? 'Sugerencia aprobada' : 'Sugerencia rechazada',
  };
}

module.exports = { listSuggestions, moderateSuggestion };