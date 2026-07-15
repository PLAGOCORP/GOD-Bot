const config = require('../config');
const db = require('../database/db');
const logging = require('./logging');

const spamMap = new Map();
/** guildId:userId -> strikes */
const strikes = new Map();
const INVITE_REGEX = /(discord\.gg|discord(?:app)?\.com\/invite)\/[a-zA-Z0-9-]+/i;
const LINK_REGEX = /https?:\/\/[^\s]+/gi;

function strikeKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function addStrike(guildId, userId) {
  const k = strikeKey(guildId, userId);
  const n = (strikes.get(k) || 0) + 1;
  strikes.set(k, n);
  // decay after 30m
  setTimeout(() => {
    const cur = strikes.get(k) || 0;
    if (cur <= 1) strikes.delete(k);
    else strikes.set(k, cur - 1);
  }, 30 * 60_000);
  return n;
}

function checkSpam(guildId, userId, am = {}) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const windowMs = am.spamWindowMs ?? config.automod.spamWindowMs;
  const maxMsgs = am.spamMaxMessages ?? config.automod.spamMaxMessages;
  const list = (spamMap.get(key) || []).filter((t) => now - t < windowMs);
  list.push(now);
  spamMap.set(key, list);
  return list.length > maxMsgs;
}

function countMentions(message) {
  return (message.mentions.users.size || 0) + (message.mentions.roles.size || 0);
}

function analyze(message, am) {
  if (!message.guild || message.author.bot) return null;
  if (message.member?.permissions?.has?.('ManageMessages')) return null;

  const content = message.content || '';
  const antiInvite = am.antiInvite !== false;
  const antiSpam = am.antiSpam !== false;
  const antiMentions = am.antiMentions !== false;
  const badWords = am.badWords || [];
  const linkBlacklist = am.linkBlacklist || [];

  if (antiInvite && INVITE_REGEX.test(content)) {
    return { reason: 'Invitación de Discord no permitida', severity: 2 };
  }
  if (am.antiLinks) {
    const links = content.match(LINK_REGEX) || [];
    for (const link of links) {
      if (linkBlacklist.some((d) => link.toLowerCase().includes(String(d).toLowerCase()))) {
        return { reason: 'Link en blacklist', severity: 2 };
      }
    }
  }
  if (antiMentions && countMentions(message) > (am.maxMentions || config.automod.maxMentions)) {
    return { reason: 'Spam de menciones', severity: 2 };
  }
  if (antiSpam && checkSpam(message.guild.id, message.author.id, am)) {
    return { reason: 'Spam de mensajes', severity: 3 };
  }
  if (am.antiAttachments && message.attachments.size > (am.maxAttachments || 5)) {
    return { reason: 'Demasiados adjuntos', severity: 1 };
  }
  if (badWords.length) {
    const lower = content.toLowerCase();
    const hit = badWords.find((w) => w && lower.includes(String(w).toLowerCase()));
    if (hit) return { reason: 'Palabra prohibida', severity: 2 };
  }
  if (am.antiCaps && content.length > 12) {
    const letters = content.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]/g, '');
    if (letters.length > 8) {
      const caps = (letters.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length;
      if (caps / letters.length > 0.7) {
        return { reason: 'Exceso de mayúsculas', severity: 1 };
      }
    }
  }
  return null;
}

/**
 * Escalation: delete → warn → timeout → kick → ban
 * steps config: ["delete","warn","timeout","kick","ban"]
 */
async function escalate(message, hit) {
  const { config: am } = await db.getModuleConfig(message.guild.id, 'automod');
  const chain = am.escalation || ['delete', 'warn', 'timeout', 'kick', 'ban'];
  const n = addStrike(message.guild.id, message.author.id);
  // pick action by strike count (severity by severity)
  const idx = Math.min(chain.length - 1, Math.max(0, n - 1 + (hit.severity >= 3 ? 1 : 0)));
  const action = chain[idx] || 'delete';

  // Always delete first
  await message.delete().catch(() => {});

  const member = message.member;
  let detail = action;

  if (action === 'warn' || (action !== 'delete' && n >= 2)) {
    await db.addWarn(message.guild.id, message.author.id, message.client.user.id, `AutoMod: ${hit.reason}`);
  }
  if (action === 'timeout' && member?.moderatable) {
    await member.timeout(10 * 60_000, `AutoMod: ${hit.reason}`).catch(() => {});
    detail = 'timeout 10m';
  }
  if (action === 'kick' && member?.kickable) {
    await member.kick(`AutoMod: ${hit.reason}`).catch(() => {});
    detail = 'kick';
  }
  if (action === 'ban' && member?.bannable) {
    await member.ban({ reason: `AutoMod: ${hit.reason}` }).catch(() => {});
    detail = 'ban';
  }

  const warn = await message.channel
    .send({
      content: `${message.author}, AutoMod (**${hit.reason}**) · strike **${n}** · acción: **${detail}**`,
    })
    .catch(() => null);
  if (warn) setTimeout(() => warn.delete().catch(() => {}), 6000);

  await logging.sendLog(message.guild, 'automod', {
    title: 'AutoMod + Escalation',
    user: message.author,
    fields: [
      { name: 'Usuario', value: `${message.author.tag} (\`${message.author.id}\`)`, inline: true },
      { name: 'Canal', value: `${message.channel}`, inline: true },
      { name: 'Razón', value: hit.reason },
      { name: 'Strikes', value: `${n}`, inline: true },
      { name: 'Acción', value: detail, inline: true },
      { name: 'Contenido', value: (message.content || '—').slice(0, 500) },
    ],
  });
  return true;
}

async function handle(message) {
  if (!message.guild || message.author.bot) return false;
  if (!await db.isModuleEnabled(message.guild.id, 'automod')) return false;
  if (message.member?.permissions?.has?.('ManageMessages')) return false;
  const { config: am } = await db.getModuleConfig(message.guild.id, 'automod');
  const hit = analyze(message, am);
  if (!hit) return false;
  return escalate(message, hit);
}

module.exports = { analyze, handle, addStrike };
