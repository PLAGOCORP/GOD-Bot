const { EmbedBuilder } = require('discord.js');
const config = require('../config');

function base(color = config.colors.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: `${config.bot.fullName} · v${config.bot.version}` });
}

const success = (title, description) =>
  base(config.colors.success).setTitle(`✅ ${title}`).setDescription(description || null);

const error = (title, description) =>
  base(config.colors.error).setTitle(`❌ ${title}`).setDescription(description || null);

const warning = (title, description) =>
  base(config.colors.warning).setTitle(`⚠️ ${title}`).setDescription(description || null);

const info = (title, description) =>
  base(config.colors.info).setTitle(`ℹ️ ${title}`).setDescription(description || null);

const god = (title, description) =>
  base(config.colors.god).setTitle(`⚡ ${title}`).setDescription(description || null);

const mod = (title, description) =>
  base(config.colors.mod).setTitle(`🛡️ ${title}`).setDescription(description || null);

module.exports = { base, success, error, warning, info, god, mod };
