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

async function findEmoji(client, name) {
  const lower = name.toLowerCase();
  // Prefer guild emojis the bot can see
  for (const guild of client.guilds.cache.values()) {
    const emoji = guild.emojis.cache.find((e) => e.name?.toLowerCase() === lower);
    if (emoji) return emoji;
  }
  // Packs in DB
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const packSnap = await fDb.collection('emotePacks')
    .where('emoji_name', '>=', lower)
    .where('emoji_name', '<=', lower + '\uf8ff')
    .limit(1)
    .get();
  const row = packSnap.empty ? null : packSnap.docs[0].data();
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

async function replaceEmotes(content, client) {
  let replaced = false;
  let out = content;
  let match;
  const regex = new RegExp(EMOJI_PARSE.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const name = match[1];
    const emoji = await findEmoji(client, name);
    if (!emoji) continue;
    replaced = true;
    let replacement;
    if (emoji.customUrl) {
      replacement = `[${name}](${emoji.customUrl})`;
    } else {
      replacement = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
    }
    out = out.replace(match[0], replacement);
  }
  return { content: out, replaced };
}

/**
 * @returns {boolean} true si se reenvió (mensaje original debe borrarse)
 */
async function handleMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return false;
  if (!await db.isModuleEnabled(message.guild.id, 'emotes')) return false;
  if (!message.content || !message.content.includes(':')) return false;

  // Don't process pure commands
  const settings = await db.getGuildSettings(message.guild.id);
  if (message.content.startsWith(settings.prefix || 'g!')) return false;

  const { content, replaced } = await replaceEmotes(message.content, message.client);
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

async function addEmote(guildId, name, url, animated = false) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  await fDb.collection('emotePacks').doc().set({
    guild_id: guildId,
    name,
    emoji_name: name,
    emoji_url: url,
    animated: !!animated,
  });
}

async function listEmotes(guildId) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const guildSnap = await fDb.collection('emotePacks')
    .where('guild_id', '==', guildId)
    .get();
  const globalSnap = await fDb.collection('emotePacks')
    .where('guild_id', '==', null)
    .get();
  return [...guildSnap.docs, ...globalSnap.docs]
    .map((d) => d.data())
    .sort((a, b) => (a.emoji_name || '').localeCompare(b.emoji_name || ''));
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
