/**
 * Verificación por reacción en canal configurado desde el panel.
 */
const { parseEmoji } = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');

const DEFAULT_MESSAGE =
  'Pulsa la reacción de abajo para aceptar las reglas y obtener acceso al servidor.\n¡Por el poder de God!';

function normalizeEmojiInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return '✅';
  const parsed = parseEmoji(s);
  if (parsed) return parsed.id ? `<:${parsed.name}:${parsed.id}>` : parsed.name;
  return s;
}

function emojiMatches(reactionEmoji, configured) {
  if (!configured) return false;
  const parsed = parseEmoji(configured);
  if (parsed?.id) return reactionEmoji.id === parsed.id;
  if (parsed?.name) return reactionEmoji.name === parsed.name;
  return reactionEmoji.name === configured;
}

async function reactWithEmoji(message, emojiStr) {
  const parsed = parseEmoji(emojiStr);
  if (!parsed) throw new Error('Emoji de verificación inválido');
  await message.react(parsed.id || parsed.name);
}

async function applyVerification(member) {
  const settings = await db.getGuildSettings(member.guild.id);
  if (settings.verifiedRole) {
    const role = member.guild.roles.cache.get(settings.verifiedRole);
    if (role) await member.roles.add(role).catch(() => {});
  }
  if (settings.unverifiedRole) {
    await member.roles.remove(settings.unverifiedRole).catch(() => {});
  }
  if (await db.isModuleEnabled(member.guild.id, 'welcome')) {
    const { config: wr } = await db.getModuleConfig(member.guild.id, 'welcome');
    for (const rid of wr.autoroles || []) {
      const role = member.guild.roles.cache.get(rid);
      if (role) await member.roles.add(role).catch(() => {});
    }
  }
  return settings;
}

async function handleReaction(reaction, user) {
  if (user.bot || !reaction.message.guild) return false;

  const settings = await db.getGuildSettings(reaction.message.guild.id);
  if (!settings.verificationMessageId || !settings.verifiedRole) return false;
  if (reaction.message.id !== settings.verificationMessageId) return false;
  if (settings.verificationChannel && reaction.message.channelId !== settings.verificationChannel) {
    return false;
  }

  const emoji = settings.verificationEmoji || '✅';
  if (!emojiMatches(reaction.emoji, emoji)) return false;

  const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
  if (!member || member.user.bot) return false;

  if (settings.verifiedRole && member.roles.cache.has(settings.verifiedRole)) return true;

  await applyVerification(member);
  return true;
}

async function publishPanel(client, guildId) {
  const settings = await db.getGuildSettings(guildId);
  if (!settings.verificationChannel) {
    throw new Error('Selecciona un canal de verificación');
  }
  if (!settings.verifiedRole) {
    throw new Error('Selecciona el rol verificado');
  }

  const guild = client?.guilds?.cache?.get(guildId);
  if (!guild) throw new Error('El bot no está conectado a este servidor');

  const channel = guild.channels.cache.get(settings.verificationChannel);
  if (!channel?.isTextBased?.()) {
    throw new Error('Canal de verificación no encontrado o no es de texto');
  }

  const me = guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms?.has(['ViewChannel', 'SendMessages', 'AddReactions', 'ReadMessageHistory'])) {
    throw new Error('El bot necesita ver el canal, enviar mensajes y añadir reacciones');
  }

  const text = settings.verificationMessage || DEFAULT_MESSAGE;
  const emoji = normalizeEmojiInput(settings.verificationEmoji);
  const embed = embeds.god('Verificación', text);

  if (settings.verificationMessageId) {
    for (const ch of guild.channels.cache.values()) {
      if (!ch.isTextBased?.()) continue;
      const oldMsg = await ch.messages.fetch(settings.verificationMessageId).catch(() => null);
      if (oldMsg) {
        await oldMsg.delete().catch(() => {});
        break;
      }
    }
  }

  const message = await channel.send({ embeds: [embed] });
  await reactWithEmoji(message, emoji);

  await db.setGuildSettings(guildId, {
    verificationMessageId: message.id,
    verificationEmoji: emoji,
    verificationMessage: text,
  });

  return {
    messageId: message.id,
    channelId: channel.id,
    url: message.url,
  };
}

module.exports = {
  DEFAULT_MESSAGE,
  normalizeEmojiInput,
  emojiMatches,
  applyVerification,
  handleReaction,
  publishPanel,
};