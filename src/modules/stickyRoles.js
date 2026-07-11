const db = require('../database/db');

/** Roles sticky por defecto: mute + configurables en settings.stickyRoleIds */
function getStickyRoleIds(guildId) {
  const s = db.getGuildSettings(guildId);
  const list = Array.isArray(s.stickyRoleIds) ? [...s.stickyRoleIds] : [];
  if (s.muteRole && !list.includes(s.muteRole)) list.push(s.muteRole);
  return list;
}

function saveMemberSticky(member) {
  const stickyIds = getStickyRoleIds(member.guild.id);
  if (!stickyIds.length) return;
  const has = stickyIds.filter((id) => member.roles.cache.has(id));
  if (!has.length) {
    // clear if none
    db.db
      .prepare('DELETE FROM sticky_roles WHERE guild_id = ? AND user_id = ?')
      .run(member.guild.id, member.id);
    return;
  }
  db.db
    .prepare(
      `INSERT INTO sticky_roles (guild_id, user_id, role_ids_json) VALUES (?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO UPDATE SET role_ids_json = excluded.role_ids_json`
    )
    .run(member.guild.id, member.id, JSON.stringify(has));
}

async function restoreOnJoin(member) {
  const row = db.db
    .prepare('SELECT role_ids_json FROM sticky_roles WHERE guild_id = ? AND user_id = ?')
    .get(member.guild.id, member.id);
  if (!row) return [];
  const ids = JSON.parse(row.role_ids_json || '[]');
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
