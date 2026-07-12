const db = require('../database/db');

/** Roles sticky por defecto: mute + configurables en settings.stickyRoleIds */
async function getStickyRoleIds(guildId) {
  const s = await db.getGuildSettings(guildId);
  const list = Array.isArray(s.stickyRoleIds) ? [...s.stickyRoleIds] : [];
  if (s.muteRole && !list.includes(s.muteRole)) list.push(s.muteRole);
  return list;
}

async function saveMemberSticky(member) {
  const stickyIds = await getStickyRoleIds(member.guild.id);
  if (!stickyIds.length) return;
  const has = stickyIds.filter((id) => member.roles.cache.has(id));
  if (!has.length) {
    await db.setStickyRoles(member.guild.id, member.id, []);
    return;
  }
  await db.setStickyRoles(member.guild.id, member.id, has);
}

async function restoreOnJoin(member) {
  const ids = await db.getStickyRoles(member.guild.id, member.id);
  if (!ids || !ids.length) return [];
  const restored = [];
  for (const id of ids) {
    const role = member.guild.roles.cache.get(id);
    if (role) {
      await member.roles.add(role, 'God sticky roles').catch(() => {});
      restored.push(id);
    }
  }
  return restored;
}

module.exports = { getStickyRoleIds, saveMemberSticky, restoreOnJoin };
