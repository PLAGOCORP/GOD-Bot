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
      await db.upsertInvite(code, guild.id, inv.inviter?.id || null, inv.uses || 0);
    }
    cache.set(guild.id, map);
  } catch {
    cache.set(guild.id, new Map());
  }
}

async function trackJoin(member) {
  if (!await db.isModuleEnabled(member.guild.id, 'invites')) return null;
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

  await db.recordJoin({
    guildId: member.guild.id,
    userId: member.id,
    inviterId: used?.inviterId,
    code: used?.code,
  });
  if (used?.inviterId) {
    await db.updateUser(member.guild.id, member.id, { inviter_id: used.inviterId });
    await checkInviteRewards(member.guild, used.inviterId);
  }
  return used;
}

async function trackLeave(member) {
  if (!await db.isModuleEnabled(member.guild.id, 'invites')) return;
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const joinSnap = await fDb.collection('inviteJoins')
    .where('guild_id', '==', member.guild.id)
    .where('user_id', '==', member.id)
    .where('left_at', '==', null)
    .orderBy('joined_at', 'desc')
    .limit(1)
    .get();
  if (joinSnap.empty) return;
  const row = { id: joinSnap.docs[0].id, ...joinSnap.docs[0].data() };

  const now = Date.now();
  const isFake = now - row.joined_at < FAKE_LEAVE_MS;
  await joinSnap.docs[0].ref.update({ left_at: now, is_fake: isFake });

  if (isFake && row.inviter_id) {
    const inviterUser = await db.getUser(member.guild.id, row.inviter_id);
    if (inviterUser) {
      await db.updateUser(member.guild.id, row.inviter_id, {
        invites_count: Math.max(0, (inviterUser.invites_count || 0) - 1),
      });
    }
    await db.upsertInvite(null, member.guild.id, row.inviter_id, null);
    const inviteSnap = await fDb.collection('invites')
      .where('guild_id', '==', member.guild.id)
      .where('inviter_id', '==', row.inviter_id)
      .limit(1)
      .get();
    if (!inviteSnap.empty) {
      await inviteSnap.docs[0].ref.update({
        fake_detected: admin.firestore.FieldValue.increment(1),
      });
    }
  }
}

async function checkInviteRewards(guild, inviterId) {
  const { config: inv } = await db.getModuleConfig(guild.id, 'invites');
  const rewards = inv.rewards || {}; // { "5": "roleId", "10": "roleId" }
  const count = await getUserInvites(guild.id, inviterId);
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

async function getUserInvites(guildId, userId) {
  const u = await db.ensureUser(guildId, userId);
  return u.invites_count || 0;
}

async function topInvites(guildId, limit = 10) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const snap = await fDb.collection('users')
    .where('guild_id', '==', guildId)
    .where('invites_count', '>', 0)
    .orderBy('invites_count', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ user_id: d.data().user_id, invites_count: d.data().invites_count }));
}

async function fakeCount(guildId, inviterId) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const snap = await fDb.collection('inviteJoins')
    .where('guild_id', '==', guildId)
    .where('inviter_id', '==', inviterId)
    .where('is_fake', '==', true)
    .count()
    .get();
  return snap.data().count;
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
