const { Events } = require('discord.js');
const db = require('../database/db');
const starboard = require('../modules/starboard');

function emojiKey(emoji) {
  return emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
}

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    if (user.bot) return;
    if (reaction.partial) {
      try {
        await reaction.fetch();
      } catch {
        return;
      }
    }
    if (!reaction.message.guild) return;

    // Starboard
    await starboard.handleReaction(reaction, user, true);

    // Reaction roles
    if (!await db.isModuleEnabled(reaction.message.guild.id, 'reaction_roles')) return;
    const rows = await db.getReactionRoles(reaction.message.id);
    if (!rows.length) return;

    const key = emojiKey(reaction.emoji);
    const alt = reaction.emoji.id || reaction.emoji.name;
    const row = rows.find((r) => r.emoji === key || r.emoji === alt || r.emoji === reaction.emoji.name);
    if (!row) return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    const role = reaction.message.guild.roles.cache.get(row.role_id);
    if (!role) return;

    if (row.mode === 'unique') {
      for (const other of rows) {
        if (other.role_id !== role.id) {
          await member.roles.remove(other.role_id).catch(() => {});
        }
      }
    }
    if (row.mode === 'remove') {
      await member.roles.remove(role).catch(() => {});
      return;
    }
    await member.roles.add(role).catch(() => {});
  },
};
