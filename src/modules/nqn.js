/**
 * NQN-style: detecta :emoji_name: y reenvía el mensaje vía webhook con emojis de cualquier servidor del bot
 */
const db = require('../database/db');
const logger = require('../utils/logger');

const EMOJI_PARSE = /(?<!<a?):([a-zA-Z0-9_]{2,32}):(?!\d+>)/g;

/** Cache de webhooks por canal */
const webhookCache = new Map();

async function getWebhook(channel) {
  const key = channel.id;
  if (webhookCache.has(key)) {
    try {
      return await channel.client.fetchWebhook(webhookCache.get(key));
    } catch {
      webhookCache.delete(key);
    }
  }
  const hooks = await channel.fetchWebhooks().catch(() => null);
  let hook = hooks?.find((h) => h.name === 'God NQN' && h.owner?.id === channel.client.user.id);
  if (!hook) {
    hook = await channel.createWebhook({
      name: 'God NQN',
      avatar: channel.client.user.displayAvatarURL(),
      reason: 'God NQN emotes',
    });
  }
  webhookCache.set(key, hook.id);
  return hook;
}

function findEmoji(client, name) {
  const lower = name.toLowerCase();
  // Prefer guild emojis the bot can see
  for (const guild of client.guilds.cache.values()) {
    const emoji = guild.emojis.cache.find((e) => e.name?.toLowerCase() === lower);
    if (emoji) return emoji;
  }
  // Packs in DB
  const row = db.db
    .prepare('SELECT * FROM emote_packs WHERE LOWER(emoji_name) = ? LIMIT 1')
    .get(lower);
  if (row) {
    return {
      name: row.emoji_name,
      id: null,
      animated: !!row.animated,
      url: row.emoji_url,
      toString() {
        return row.animated
          ? `<a:${row.emoji_name}:0>`
          : `<:${row.emoji_name}:0>`;
      },
      customUrl: row.emoji_url,
    };
  }
  return null;
}

function replaceEmotes(content, client) {
  let replaced = false;
  const out = content.replace(EMOJI_PARSE, (match, name) => {
    const emoji = findEmoji(client, name);
    if (!emoji) return match;
    replaced = true;
    if (emoji.customUrl) {
      // Use markdown image for pack URLs when no discord emoji id
      return `[${name}](${emoji.customUrl})`;
    }
    return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
  });
  return { content: out, replaced };
}

/**
 * @returns {boolean} true si se reenvió (mensaje original debe borrarse)
 */
async function handleMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return false;
  if (!db.isModuleEnabled(message.guild.id, 'emotes')) return false;
  if (!message.content || !message.content.includes(':')) return false;

  // Don't process pure commands
  const settings = db.getGuildSettings(message.guild.id);
  if (message.content.startsWith(settings.prefix || 'g!')) return false;

  const { content, replaced } = replaceEmotes(message.content, message.client);
  if (!replaced) return false;

  try {
    const hook = await getWebhook(message.channel);
    await hook.send({
      content,
      username: message.member?.displayName || message.author.username,
      avatarURL: message.author.displayAvatarURL({ size: 256 }),
      allowedMentions: { parse: [] },
    });
    await message.delete().catch(() => {});
    return true;
  } catch (err) {
    logger.error('NQN:', err.message);
    return false;
  }
}

function addEmote(guildId, name, url, animated = false) {
  db.db
    .prepare(
      'INSERT INTO emote_packs (guild_id, name, emoji_name, emoji_url, animated) VALUES (?, ?, ?, ?, ?)'
    )
    .run(guildId, name, name, url, animated ? 1 : 0);
}

function listEmotes(guildId) {
  return db.db
    .prepare('SELECT * FROM emote_packs WHERE guild_id = ? OR guild_id IS NULL ORDER BY emoji_name')
    .all(guildId);
}

function stealEmoji(guild, emoji) {
  // emoji from message or string
  if (emoji.id) {
    const ext = emoji.animated ? 'gif' : 'png';
    const url = `https://cdn.discordapp.com/emojis/${emoji.id}.${ext}`;
    return guild.emojis.create({ attachment: url, name: emoji.name });
  }
  throw new Error('Emoji no personalizado (no se puede robar unicode).');
}

module.exports = { handleMessage, addEmote, listEmotes, stealEmoji, findEmoji, replaceEmotes };
