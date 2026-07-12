const db = require('../database/db');
const config = require('../config');
const { randomInt, levelFromXp } = require('../utils/helpers');
const embeds = require('../utils/embeds');
const { rankCard } = require('../utils/canvas');
const { AttachmentBuilder } = require('discord.js');

async function isNoXp(message) {
  const { config: lv } = await db.getModuleConfig(message.guild.id, 'leveling');
  const noChannels = lv.noXpChannels || [];
  const noRoles = lv.noXpRoles || [];
  if (noChannels.includes(message.channel.id)) return true;
  if (message.member) {
    for (const rid of noRoles) {
      if (message.member.roles.cache.has(rid)) return true;
    }
  }
  return false;
}

async function xpMultiplier(member) {
  if (!member) return 1;
  const { config: lv } = await db.getModuleConfig(member.guild.id, 'leveling');
  const mults = lv.roleMultipliers || {}; // { roleId: 1.5 }
  let m = 1;
  for (const [roleId, mul] of Object.entries(mults)) {
    if (member.roles.cache.has(roleId)) m = Math.max(m, Number(mul) || 1);
  }
  if (member.premiumSince) m = Math.max(m, lv.boosterMultiplier || 1.25);
  return m;
}

async function addTextXp(guildId, userId, message) {
  if (!await db.isModuleEnabled(guildId, 'leveling')) return null;
  if (message && await isNoXp(message)) return null;

  const user = await db.ensureUser(guildId, userId);
  const now = Date.now();
  if (now - (user.last_xp || 0) < config.leveling.cooldown) return null;

  const mult = message?.member ? await xpMultiplier(message.member) : 1;
  const amount = Math.floor(randomInt(config.leveling.xpMin, config.leveling.xpMax) * mult);
  const before = levelFromXp(user.xp_text);
  const xp_text = user.xp_text + amount;
  const after = levelFromXp(xp_text);

  await db.updateUser(guildId, userId, {
    xp_text,
    level_text: after.level,
    last_xp: now,
    messages_count: (user.messages_count || 0) + 1,
  });

  return {
    amount,
    leveledUp: after.level > before.level,
    oldLevel: before.level,
    newLevel: after.level,
    ...after,
    xp_text,
  };
}

async function leaderboard(guildId, limit = 10) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const snap = await fDb.collection('users')
    .where('guild_id', '==', guildId)
    .orderBy('xp_text', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({
    user_id: d.data().user_id,
    xp_text: d.data().xp_text,
    level_text: d.data().level_text,
    messages_count: d.data().messages_count,
  }));
}

async function rankOf(guildId, userId) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const snap = await fDb.collection('users')
    .where('guild_id', '==', guildId)
    .orderBy('xp_text', 'desc')
    .get();
  const rows = snap.docs.map((d) => ({ user_id: d.data().user_id }));
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

async function announceLevelUp(message, result) {
  if (!result?.leveledUp) return;
  const settings = await db.getGuildSettings(message.guild.id);
  const channel = settings.levelChannel
    ? message.guild.channels.cache.get(settings.levelChannel)
    : message.channel;
  if (!channel) return;

  const { config: lv } = await db.getModuleConfig(message.guild.id, 'leveling');
  const rewards = lv.rewards || {};
  const roleId = rewards[String(result.newLevel)];
  if (roleId) {
    const role = message.guild.roles.cache.get(roleId);
    if (role) await message.member.roles.add(role).catch(() => {});
  }

  let files = [];
  try {
    const png = await rankCard({
      username: message.author.username,
      level: result.newLevel,
      currentXp: result.currentXp,
      needed: result.needed,
      rank: await rankOf(message.guild.id, message.author.id),
    });
    files = [new AttachmentBuilder(png, { name: 'levelup.png' })];
  } catch { /* */ }

  await channel
    .send({
      embeds: [
        embeds
          .god(
            '¡Subiste de nivel!',
            `🎉 ${message.author} alcanzó el nivel **${result.newLevel}**\n¡Por el poder de God!`
          )
          .setImage(files.length ? 'attachment://levelup.png' : null),
      ],
      files,
    })
    .catch(() => {});
}

module.exports = { addTextXp, leaderboard, rankOf, announceLevelUp, isNoXp, xpMultiplier };
