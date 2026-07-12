/**
 * Anti-raid: joins masivos en ventana corta → alerta + lockdown opcional
 */
const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const logging = require('./logging');
const embeds = require('../utils/embeds');

/** guildId -> timestamps[] */
const joins = new Map();
const lockdownUntil = new Map();

function isLocked(guildId) {
  const until = lockdownUntil.get(guildId) || 0;
  return Date.now() < until;
}

function recordJoin(guildId) {
  const now = Date.now();
  const s = db.getGuildSettings(guildId);
  const windowMs = s.antiraidWindowMs || 15_000;
  const list = (joins.get(guildId) || []).filter((t) => now - t < windowMs);
  list.push(now);
  joins.set(guildId, list);
  return list.length;
}

async function onMemberJoin(member) {
  if (!db.isModuleEnabled(member.guild.id, 'antiraid')) return null;

  const settings = db.getGuildSettings(member.guild.id);
  const threshold = settings.antiraidThreshold || 8;
  const count = recordJoin(member.guild.id);

  // Account age check
  const minAge = settings.minAccountAgeHours || 0;
  if (minAge > 0) {
    const ageH = (Date.now() - member.user.createdTimestamp) / 3600_000;
    if (ageH < minAge) {
      await logging.sendLog(member.guild, 'automod', {
        title: '⚠️ Cuenta muy nueva',
        user: member.user,
        fields: [
          { name: 'Usuario', value: `${member.user.tag} (\`${member.id}\`)` },
          { name: 'Edad cuenta', value: `${ageH.toFixed(1)}h (mín ${minAge}h)` },
        ],
      });
      if (settings.kickNewAccounts) {
        await member.kick(`Cuenta más nueva que ${minAge}h`).catch(() => {});
        return { kicked: true, reason: 'account_age' };
      }
    }
  }

  if (count < threshold) return null;

  // RAID DETECTED
  const lockMinutes = settings.antiraidLockMinutes || 10;
  lockdownUntil.set(member.guild.id, Date.now() + lockMinutes * 60_000);

  await logging.sendLog(member.guild, 'automod', {
    title: '🚨 ANTI-RAID ACTIVADO',
    fields: [
      { name: 'Joins recientes', value: `${count} en ventana corta` },
      { name: 'Umbral', value: `${threshold}` },
      { name: 'Lockdown', value: `${lockMinutes} minutos` },
      { name: 'Último join', value: `${member.user.tag}` },
    ],
  });

  // Lockdown: deny SendMessages in text channels for @everyone
  try {
    const textChannels = member.guild.channels.cache.filter(c => c.type === 0 && c.viewable);
    for (const [, ch] of textChannels) {
      await ch.permissionOverwrites.edit(member.guild.roles.everyone, {
        SendMessages: false,
      }).catch(() => {});
    }
  } catch { /* */ }

  // Kick the latest wave member optionally
  if (settings.antiraidKick) {
    await member.kick('Anti-raid: join masivo').catch(() => {});
  }

  try {
    const owner = await member.guild.fetchOwner();
    await owner.send({
      embeds: [
        embeds.error(
          'Anti-Raid',
          `**${member.guild.name}**: ${count} joins rápidos. Lockdown ~${lockMinutes}m.`
        ),
      ],
    });
  } catch { /* */ }

  return { raid: true, count };
}

module.exports = { onMemberJoin, isLocked, recordJoin };
