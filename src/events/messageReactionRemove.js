const { Events } = require('discord.js');
const db = require('../database/db');
const starboard = require('../modules/starboard');

function emojiKey(emoji) {
  return emoji.id ? `<:${emoji.name}:${emoji.id}>` : emoji.name;
}

module.exports = {
  name: Events.MessageReactionRemove,
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

    await starboard.handleReaction(reaction, user, false);

    const rows = await db.getReactionRoles(reaction.message.id);
    const key = emojiKey(reaction.emoji);
    const alt = reaction.emoji.id || reaction.emoji.name;
    const row = rows.find((r) => r.emoji === key || r.emoji === alt || r.emoji === reaction.emoji.name);
    if (!row || row.mode === 'once' || row.mode === 'remove') return;

    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    if (row.mode === 'toggle' || row.mode === 'unique') {
      await member.roles.remove(row.role_id).catch(() => {});
    }
  },
};
