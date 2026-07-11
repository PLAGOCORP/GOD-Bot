const { Events, ActivityType } = require('discord.js');
const config = require('../config');
const logger = require('../utils/logger');
const giveaways = require('../modules/giveaways');
const invites = require('../modules/invites');
const db = require('../database/db');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    logger.info(`Online como ${client.user.tag} | ${client.guilds.cache.size} servidores | v${config.bot.version}`);
    console.log(`
  ██████╗  ██████╗ ██████╗
 ██╔════╝ ██╔═══██╗██╔══██╗
 ██║  ███╗██║   ██║██║  ██║
 ██║   ██║██║   ██║██║  ██║
 ╚██████╔╝╚██████╔╝██████╔╝
  G.O.D. v${config.bot.version} — Todo-en-uno
  ${client.user.tag} · ${client.commands.size} comandos
`);

    for (const guild of client.guilds.cache.values()) {
      db.ensureGuild(guild.id);
      invites.cacheGuildInvites(guild).catch(() => {});
    }

    giveaways.startChecker(client);

    const activities = [
      { name: `${client.guilds.cache.size} servidores | /ayuda`, type: ActivityType.Watching },
      { name: 'ser el bot definitivo', type: ActivityType.Playing },
      { name: '/god setup', type: ActivityType.Listening },
    ];
    let i = 0;
    client.user.setPresence({ activities: [activities[0]], status: 'online' });
    setInterval(() => {
      i = (i + 1) % activities.length;
      const a = { ...activities[i] };
      if (i === 0) a.name = `${client.guilds.cache.size} servidores | /ayuda`;
      client.user.setActivity(a.name, { type: a.type });
    }, 45_000);
  },
};
