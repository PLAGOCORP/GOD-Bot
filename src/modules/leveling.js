const db = require('../database/db');
const config = require('../config');
const { randomInt, levelFromXp } = require('../utils/helpers');
const embeds = require('../utils/embeds');
const { rankCard } = require('../utils/canvas');
const { AttachmentBuilder } = require('discord.js');

function isNoXp(message) {
  const { config: lv } = db.getModuleConfig(message.guild.id, 'leveling');
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

function xpMultiplier(member) {
  if (!member) return 1;
  const { config: lv } = db.getModuleConfig(member.guild.id, 'leveling');
  const mults = lv.roleMultipliers || {}; // { roleId: 1.5 }
  let m = 1;
  for (const [roleId, mul] of Object.entries(mults)) {
    if (member.roles.cache.has(roleId)) m = Math.max(m, Number(mul) || 1);
  }
  if (member.premiumSince) m = Math.max(m, lv.boosterMultiplier || 1.25);
  return m;
}

function addTextXp(guildId, userId, message) {
  if (!db.isModuleEnabled(guildId, 'leveling')) return null;
  if (message && isNoXp(message)) return null;

  const user = db.ensureUser(guildId, userId);
  const now = Date.now();
  if (now - (user.last_xp || 0) < config.leveling.cooldown) return null;

  const mult = message?.member ? xpMultiplier(message.member) : 1;
  const amount = Math.floor(randomInt(config.leveling.xpMin, config.leveling.xpMax) * mult);
  const before = levelFromXp(user.xp_text);
  const xp_text = user.xp_text + amount;
  const after = levelFromXp(xp_text);

  db.updateUser(guildId, userId, {
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

function leaderboard(guildId, limit = 10) {
  return db.db
    .prepare(
      'SELECT user_id, xp_text, level_text, messages_count FROM users WHERE guild_id = ? ORDER BY xp_text DESC LIMIT ?'
    )
    .all(guildId, limit);
}

function rankOf(guildId, userId) {
  const rows = db.db
    .prepare('SELECT user_id FROM users WHERE guild_id = ? ORDER BY xp_text DESC')
    .all(guildId);
  const idx = rows.findIndex((r) => r.user_id === userId);
  return idx === -1 ? null : idx + 1;
}

async function announceLevelUp(message, result) {
  if (!result?.leveledUp) return;
  const settings = db.getGuildSettings(message.guild.id);
  const channel = settings.levelChannel
    ? message.guild.channels.cache.get(settings.levelChannel)
    : message.channel;
  if (!channel) return;

  const { config: lv } = db.getModuleConfig(message.guild.id, 'leveling');
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
      rank: rankOf(message.guild.id, message.author.id),
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
