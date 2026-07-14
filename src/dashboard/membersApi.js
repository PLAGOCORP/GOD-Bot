const db = require('../database/db');
const logging = require('../modules/logging');

function formatMember(member, userData) {
  const status = member.presence?.status || 'offline';
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName || member.user.globalName || member.user.username,
    avatar: member.user.displayAvatarURL({ size: 128 }),
    joinedAt: member.joinedTimestamp || null,
    status,
    level: userData?.level_text || 0,
    balance: userData?.balance ?? 0,
    warns: userData?.warns_count || 0,
    roles: member.roles.cache
      .filter((r) => r.id !== member.guild.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, 8)
      .map((r) => ({ id: r.id, name: r.name, color: r.hexColor })),
  };
}

function sortMembers(list, sort) {
  const cmp = {
    name: (a, b) => a.displayName.localeCompare(b.displayName, 'es'),
    joined: (a, b) => (b.joinedAt || 0) - (a.joinedAt || 0),
    level: (a, b) => b.level - a.level,
    warnings: (a, b) => b.warns - a.warns,
  };
  const fn = cmp[sort] || cmp.name;
  list.sort(fn);
}

async function enrichMembers(guildId, members) {
  return Promise.all(
    members.map(async (m) => {
      const data = (await db.getUser(guildId, m.id)) || (await db.ensureUser(guildId, m.id));
      return formatMember(m, data);
    })
  );
}

async function listMembers(client, guildId, { q = '', sort = 'name', page = 1, limit = 25 } = {}) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error('El bot no está en este servidor');

  let rawMembers;

  if (q) {
    if (/^\d{17,20}$/.test(q.trim())) {
      const m = await guild.members.fetch(q.trim()).catch(() => null);
      rawMembers = m ? [m] : [];
    } else {
      const query = q.trim();
      try {
        const searched = await guild.members.search({ query, limit: 100 });
        rawMembers = [...searched.values()];
      } catch {
        if (guild.members.cache.size < guild.memberCount) {
          await guild.members.fetch({ limit: 1000 }).catch(() => {});
        }
        const lower = query.toLowerCase();
        rawMembers = [...guild.members.cache.values()].filter(
          (m) =>
            !m.user.bot &&
            (m.user.username.toLowerCase().includes(lower) ||
              (m.user.globalName || '').toLowerCase().includes(lower) ||
              m.displayName.toLowerCase().includes(lower))
        );
      }
    }
  } else {
    if (guild.members.cache.size < Math.min(guild.memberCount, 1000)) {
      await guild.members.fetch({ withPresences: true, limit: 1000 }).catch(() => {});
    }
    rawMembers = [...guild.members.cache.values()].filter((m) => !m.user.bot);
  }

  const enriched = await enrichMembers(guildId, rawMembers);
  sortMembers(enriched, sort);

  const total = enriched.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const pageNum = Math.min(Math.max(1, parseInt(page, 10) || 1), pages);
  const slice = enriched.slice((pageNum - 1) * limit, pageNum * limit);
  const online = enriched.filter((m) => ['online', 'idle', 'dnd'].includes(m.status)).length;

  return { members: slice, total, page: pageNum, pages, limit, online };
}

async function getMemberProfile(client, guildId, userId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error('El bot no está en este servidor');

  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) throw new Error('Miembro no encontrado en el servidor');

  const userData = (await db.getUser(guildId, userId)) || (await db.ensureUser(guildId, userId));
  const warns = await db.listWarns(guildId, userId);

  return {
    ...formatMember(member, userData),
    xpText: userData.xp_text || 0,
    xpVoice: userData.xp_voice || 0,
    messages: userData.messages_count || 0,
    voiceMinutes: userData.voice_minutes || 0,
    warnsList: warns.map((w) => ({
      id: w.id,
      reason: w.reason,
      modId: w.mod_id,
      timestamp: w.timestamp,
    })),
  };
}

async function moderateMember(client, guildId, userId, action, { reason, durationMinutes }, modUserId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error('El bot no está en este servidor');

  const moderator = await client.users.fetch(modUserId).catch(() => ({ id: modUserId, tag: `Usuario ${modUserId}` }));
  const member = await guild.members.fetch(userId).catch(() => null);
  const targetUser = member?.user || (await client.users.fetch(userId).catch(() => null));
  if (!targetUser && action !== 'clearwarns') throw new Error('Usuario no encontrado');

  const modReason = reason || 'Acción desde dashboard web';

  switch (action) {
    case 'warn': {
      const { id, total } = await db.addWarn(guildId, userId, modUserId, modReason);
      await logging.logModAction(guild, 'warn', {
        moderator,
        target: targetUser,
        reason: modReason,
        extra: `Warn #${id} · Total: ${total} · vía dashboard`,
      });
      await db.insertLog(guildId, 'dashboard_warn', {
        userId: modUserId,
        targetId: userId,
        details: { warnId: id, total, reason: modReason },
      });
      return { message: `Advertencia emitida (#${id}). Total: ${total}` };
    }
    case 'clearwarns': {
      await db.clearWarns(guildId, userId);
      await logging.logModAction(guild, 'unwarn', {
        moderator,
        target: targetUser,
        reason: 'Warns limpiados desde dashboard',
      });
      await db.insertLog(guildId, 'dashboard_clearwarns', { userId: modUserId, targetId: userId, details: {} });
      return { message: 'Warnings eliminados' };
    }
    case 'kick': {
      if (!member?.kickable) throw new Error('No puedo expulsar a este usuario');
      await member.kick(`${moderator.tag}: ${modReason}`);
      await logging.logModAction(guild, 'kick', { moderator, target: targetUser, reason: modReason });
      await db.insertLog(guildId, 'dashboard_kick', { userId: modUserId, targetId: userId, details: { reason: modReason } });
      return { message: 'Usuario expulsado' };
    }
    case 'ban': {
      if (member && !member.bannable) throw new Error('No puedo banear a este usuario');
      await guild.members.ban(userId, { reason: `${moderator.tag}: ${modReason}`, deleteMessageSeconds: 0 });
      await logging.logModAction(guild, 'ban', { moderator, target: targetUser, reason: modReason });
      await db.insertLog(guildId, 'dashboard_ban', { userId: modUserId, targetId: userId, details: { reason: modReason } });
      return { message: 'Usuario baneado' };
    }
    case 'timeout': {
      if (!member?.moderatable) throw new Error('No puedo aplicar timeout a este usuario');
      const mins = Math.min(Math.max(parseInt(durationMinutes, 10) || 10, 1), 40320);
      const ms = mins * 60_000;
      await member.timeout(ms, `${moderator.tag}: ${modReason}`);
      await logging.logModAction(guild, 'timeout', {
        moderator,
        target: targetUser,
        reason: modReason,
        extra: `${mins} min · vía dashboard`,
      });
      await db.insertLog(guildId, 'dashboard_timeout', {
        userId: modUserId,
        targetId: userId,
        details: { reason: modReason, minutes: mins },
      });
      return { message: `Timeout de ${mins} min aplicado` };
    }
    default:
      throw new Error('Acción no válida');
  }
}

module.exports = { listMembers, getMemberProfile, moderateMember };