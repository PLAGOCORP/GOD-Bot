const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const db = require('../database/db');
const config = require('../config');
const { truncate } = require('../utils/helpers');

const TYPE_COLOR = {
  ban: config.colors.error,
  kick: config.colors.warning,
  timeout: config.colors.mod,
  warn: config.colors.warning,
  unwarn: config.colors.success,
  purge: config.colors.info,
  message_delete: config.colors.logDelete,
  message_edit: config.colors.logEdit,
  member_join: config.colors.logJoin,
  member_leave: config.colors.logLeave,
  automod: config.colors.error,
  ticket: config.colors.info,
  role: config.colors.primary,
};

async function resolveLogChannel(guild, type) {
  if (!await db.isModuleEnabled(guild.id, 'logging')) return null;
  const s = await db.getGuildSettings(guild.id);
  const map = {
    ban: 'mod',
    kick: 'mod',
    timeout: 'mod',
    warn: 'mod',
    unwarn: 'mod',
    purge: 'mod',
    automod: 'mod',
    message_delete: 'message',
    message_edit: 'message',
    member_join: 'member',
    member_leave: 'member',
    ticket: 'ticket',
    role: 'server',
  };
  const key = map[type] || 'mod';
  const id = s.logChannels?.[key] || s.logChannels?.mod;
  if (!id) return null;
  return guild.channels.cache.get(id) || null;
}

/**
 * Envía un log visual + persiste en DB
 */
async function sendLog(guild, type, { title, description, fields = [], user, target, moderator, color }) {
  await db.insertLog(guild.id, type, {
    userId: moderator?.id || user?.id,
    targetId: target?.id || user?.id,
    details: { title, description, fields },
  });

  const channel = await resolveLogChannel(guild, type);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(color || TYPE_COLOR[type] || config.colors.primary)
    .setTitle(title || type)
    .setDescription(description || null)
    .setTimestamp()
    .setFooter({ text: `God Logs · ${type}` });

  if (fields.length) embed.addFields(fields.slice(0, 25));
  if (target?.displayAvatarURL) embed.setThumbnail(target.displayAvatarURL({ size: 128 }));
  else if (user?.displayAvatarURL) embed.setThumbnail(user.displayAvatarURL({ size: 128 }));

  await channel.send({ embeds: [embed] }).catch(() => {});
}

async function logModAction(guild, type, { moderator, target, reason, extra }) {
  await sendLog(guild, type, {
    title: `Moderación: ${type.toUpperCase()}`,
    description: extra || null,
    moderator,
    target,
    fields: [
      { name: 'Usuario', value: target ? `${target.tag || target} (\`${target.id}\`)` : '—', inline: true },
      { name: 'Moderador', value: moderator ? `${moderator.tag}` : '—', inline: true },
      { name: 'Razón', value: reason || 'Sin razón', inline: false },
    ],
  });
}

async function logMessageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  await sendLog(message.guild, 'message_delete', {
    title: 'Mensaje eliminado',
    user: message.author,
    fields: [
      { name: 'Autor', value: `${message.author}`, inline: true },
      { name: 'Canal', value: `${message.channel}`, inline: true },
      { name: 'Contenido', value: truncate(message.content || '*sin texto / solo adjuntos*', 1000) },
    ],
  });
}

async function logMessageEdit(oldMsg, newMsg) {
  if (!newMsg.guild || newMsg.author?.bot) return;
  if (oldMsg.content === newMsg.content) return;
  await sendLog(newMsg.guild, 'message_edit', {
    title: 'Mensaje editado',
    user: newMsg.author,
    fields: [
      { name: 'Autor', value: `${newMsg.author}`, inline: true },
      { name: 'Canal', value: `${newMsg.channel}`, inline: true },
      { name: 'Antes', value: truncate(oldMsg.content || '—', 500) },
      { name: 'Después', value: truncate(newMsg.content || '—', 500) },
      { name: 'Salto', value: `[Ir al mensaje](${newMsg.url})` },
    ],
  });
}

module.exports = {
  sendLog,
  logModAction,
  logMessageDelete,
  logMessageEdit,
  resolveLogChannel,
  AuditLogEvent,
};
