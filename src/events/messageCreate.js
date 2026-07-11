const { Events } = require('discord.js');
const config = require('../config');
const db = require('../database/db');
const automod = require('../modules/automod');
const leveling = require('../modules/leveling');
const nqn = require('../modules/nqn');
const embeds = require('../utils/embeds');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;

    // Update ticket activity
    const ticket = db.getTicketByChannel(message.channel.id);
    if (ticket) {
      db.updateTicket(ticket.id, { last_activity: Date.now() });
    }

    if (await automod.handle(message)) return;

    // NQN emotes (real webhook repost)
    if (await nqn.handleMessage(message)) return;

    // AFK
    const afkSelf = db.getAfk(message.guild.id, message.author.id);
    if (afkSelf) {
      db.clearAfk(message.guild.id, message.author.id);
      message.channel
        .send({ embeds: [embeds.success('AFK', `${message.author}, ya no estás AFK.`)] })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 4000))
        .catch(() => {});
    }
    if (message.mentions.users.size) {
      for (const [, user] of message.mentions.users) {
        const data = db.getAfk(message.guild.id, user.id);
        if (data) {
          message
            .reply({
              embeds: [
                embeds.info(
                  'Usuario AFK',
                  `**${user.tag}** está AFK: ${data.reason}\nDesde: <t:${Math.floor(data.since / 1000)}:R>`
                ),
              ],
            })
            .catch(() => {});
        }
      }
    }

    // Leveling text XP (respeta no-XP channels/roles)
    const xp = leveling.addTextXp(message.guild.id, message.author.id, message);
    if (xp) await leveling.announceLevelUp(message, xp);

    const settings = db.getGuildSettings(message.guild.id);
    const prefix = settings.prefix || config.prefix;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/\s+/);
    const name = (args.shift() || '').toLowerCase();
    if (!name) return;

    if (name === 'ping') {
      const sent = await message.reply('🏓 ...');
      return sent.edit(
        `🏓 **Pong!** \`${sent.createdTimestamp - message.createdTimestamp}ms\` · API \`${Math.round(client.ws.ping)}ms\``
      );
    }

    const tagCmd = client.commands.get('tag');
    const render =
      tagCmd?.renderTag ||
      ((c) => c);

    if (name === 'tag' && args[0]) {
      const tag = db.getTag(message.guild.id, args[0]);
      if (tag) {
        const fakeIx = {
          user: message.author,
          guild: message.guild,
          channel: message.channel,
        };
        return message.reply(render(tag.content, fakeIx));
      }
    }

    const tag = db.getTag(message.guild.id, name);
    if (tag) {
      db.db.prepare('UPDATE tags SET uses = uses + 1 WHERE guild_id = ? AND name = ?').run(message.guild.id, name);
      const fakeIx = {
        user: message.author,
        guild: message.guild,
        channel: message.channel,
      };
      return message.reply(render(tag.content, fakeIx));
    }
  },
};
