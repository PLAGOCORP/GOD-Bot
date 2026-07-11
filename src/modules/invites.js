const db = require('../database/db');
const logging = require('./logging');

const cache = new Map();
const FAKE_LEAVE_MS = 10 * 60_000; // leave dentro de 10m = fake

async function cacheGuildInvites(guild) {
  try {
    const invites = await guild.invites.fetch();
    const map = new Map();
    for (const [code, inv] of invites) {
      map.set(code, { uses: inv.uses || 0, inviterId: inv.inviter?.id || null });
      db.upsertInvite(code, guild.id, inv.inviter?.id || null, inv.uses || 0);
    }
    cache.set(guild.id, map);
  } catch {
    cache.set(guild.id, new Map());
  }
}

async function trackJoin(member) {
  if (!db.isModuleEnabled(member.guild.id, 'invites')) return null;
  let used = null;
  try {
    const newInvites = await member.guild.invites.fetch();
    const old = cache.get(member.guild.id) || new Map();
    for (const [code, inv] of newInvites) {
      const prev = old.get(code);
      const prevUses = prev?.uses ?? 0;
      if ((inv.uses || 0) > prevUses) {
        used = { code, inviterId: inv.inviter?.id || prev?.inviterId || null, uses: inv.uses };
        break;
      }
    }
    await cacheGuildInvites(member.guild);
  } catch { /* */ }

  db.recordJoin({
    guildId: member.guild.id,
    userId: member.id,
    inviterId: used?.inviterId,
    code: used?.code,
  });
  if (used?.inviterId) {
    db.updateUser(member.guild.id, member.id, { inviter_id: used.inviterId });
    await checkInviteRewards(member.guild, used.inviterId);
  }
  return used;
}

async function trackLeave(member) {
  if (!db.isModuleEnabled(member.guild.id, 'invites')) return;
  const row = db.db
    .prepare(
      'SELECT * FROM invite_joins WHERE guild_id = ? AND user_id = ? AND left_at IS NULL ORDER BY joined_at DESC LIMIT 1'
    )
    .get(member.guild.id, member.id);
  if (!row) return;

  const now = Date.now();
  const isFake = now - row.joined_at < FAKE_LEAVE_MS ? 1 : 0;
  db.db
    .prepare('UPDATE invite_joins SET left_at = ?, is_fake = ? WHERE id = ?')
    .run(now, isFake, row.id);

  if (isFake && row.inviter_id) {
    // decrement invites_count for fake
    db.db
      .prepare(
        'UPDATE users SET invites_count = CASE WHEN invites_count > 0 THEN invites_count - 1 ELSE 0 END WHERE user_id = ? AND guild_id = ?'
      )
      .run(row.inviter_id, member.guild.id);
    db.db
      .prepare('UPDATE invites SET fake_detected = fake_detected + 1 WHERE guild_id = ? AND inviter_id = ?')
      .run(member.guild.id, row.inviter_id);
  }
}

async function checkInviteRewards(guild, inviterId) {
  const { config: inv } = db.getModuleConfig(guild.id, 'invites');
  const rewards = inv.rewards || {}; // { "5": "roleId", "10": "roleId" }
  const count = getUserInvites(guild.id, inviterId);
  const member = await guild.members.fetch(inviterId).catch(() => null);
  if (!member) return;

  for (const [need, roleId] of Object.entries(rewards)) {
    if (count >= Number(need)) {
      const role = guild.roles.cache.get(roleId);
      if (role && !member.roles.cache.has(roleId)) {
        await member.roles.add(role, `Invite reward: ${need}`).catch(() => {});
        await logging.sendLog(guild, 'role', {
          title: 'Recompensa de invites',
          fields: [
            { name: 'Usuario', value: `${member}` },
            { name: 'Invites', value: `${count}` },
            { name: 'Rol', value: `${role}` },
          ],
        });
      }
    }
  }

  // XP bonus optional
  if (inv.xpPerInvite && count > 0) {
    // only on thresholds handled above; skip spam
  }
}

function getUserInvites(guildId, userId) {
  const u = db.ensureUser(guildId, userId);
  return u.invites_count || 0;
}

function topInvites(guildId, limit = 10) {
  return db.db
    .prepare(
      'SELECT user_id, invites_count FROM users WHERE guild_id = ? AND invites_count > 0 ORDER BY invites_count DESC LIMIT ?'
    )
    .all(guildId, limit);
}

function fakeCount(guildId, inviterId) {
  return db.db
    .prepare(
      'SELECT COUNT(*) AS c FROM invite_joins WHERE guild_id = ? AND inviter_id = ? AND is_fake = 1'
    )
    .get(guildId, inviterId).c;
}

module.exports = {
  cacheGuildInvites,
  trackJoin,
  trackLeave,
  getUserInvites,
  topInvites,
  checkInviteRewards,
  fakeCount,
};
