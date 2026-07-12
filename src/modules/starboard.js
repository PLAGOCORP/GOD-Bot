const { EmbedBuilder } = require('discord.js');
const db = require('../database/db');
const config = require('../config');

function emojiMatch(reaction, wanted) {
  if (!wanted) return reaction.emoji.name === '⭐';
  if (wanted.length <= 4 || !/\d/.test(wanted)) return reaction.emoji.name === wanted;
  // custom <:name:id>
  const id = wanted.match(/(\d{15,})/)?.[1];
  return id ? reaction.emoji.id === id : reaction.emoji.name === wanted;
}

async function handleReaction(reaction, user, added) {
  if (user.bot) return;
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return;
    }
  }
  const message = reaction.message;
  if (!message.guild || message.author?.bot) return;
  if (!db.isModuleEnabled(message.guild.id, 'starboard')) return;

  const settings = db.getGuildSettings(message.guild.id);
  if (!settings.starboardChannel) return;
  if (!emojiMatch(reaction, settings.starboardEmoji)) return;

  // ignore if reaction is in starboard channel itself
  if (message.channel.id === settings.starboardChannel) return;

  const min = settings.starboardMin || 3;
  const count = reaction.count || 0;

  let row = await db.getStarboard(message.id, message.guild.id);

  const starCh = message.guild.channels.cache.get(settings.starboardChannel);
  if (!starCh) return;

  if (count < min) {
    if (row?.starboard_message_id) {
      const sm = await starCh.messages.fetch(row.starboard_message_id).catch(() => null);
      if (sm) await sm.delete().catch(() => {});
      await db.deleteStarboard(message.id, message.guild.id);
    }
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(config.colors.god)
    .setAuthor({
      name: message.author?.tag || 'Usuario',
      iconURL: message.author?.displayAvatarURL?.({ size: 64 }),
    })
    .setDescription(message.content?.slice(0, 4000) || '*sin texto*')
    .addFields({ name: 'Origen', value: `[Saltar al mensaje](${message.url}) · ${message.channel}` })
    .setTimestamp(message.createdAt);

  const img = message.attachments.find((a) => a.contentType?.startsWith('image/'));
  if (img) embed.setImage(img.url);

  const content = `${settings.starboardEmoji || '⭐'} **${count}** | ${message.channel}`;

  if (row?.starboard_message_id) {
    const sm = await starCh.messages.fetch(row.starboard_message_id).catch(() => null);
    if (sm) {
      await sm.edit({ content, embeds: [embed] });
      await db.saveStarboard({ message_id: message.id, guild_id: message.guild.id, star_count: count });
      return;
    }
  }

  const sent = await starCh.send({ content, embeds: [embed] });
  await db.saveStarboard({
    message_id: message.id,
    guild_id: message.guild.id,
    channel_id: message.channel.id,
    star_count: count,
    starboard_message_id: sent.id,
    author_id: message.author?.id || null,
  });
}

module.exports = { handleReaction };
