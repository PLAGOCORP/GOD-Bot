const { Events, AuditLogEvent } = require('discord.js');
const logging = require('../modules/logging');
const antinuke = require('../modules/antinuke');
const db = require('../database/db');

module.exports = {
  name: Events.ChannelCreate,
  async execute(channel) {
    if (!channel.guild) return;
    if (db.isModuleEnabled(channel.guild.id, 'logging')) {
      await logging.sendLog(channel.guild, 'role', {
        title: 'Canal creado',
        fields: [{ name: 'Canal', value: `${channel} (\`${channel.name}\`)` }],
      });
    }
    // rapid channel create can be nuke-ish - track via audit as generic
    await antinuke.fromAudit(channel.guild, 'channel_create', AuditLogEvent.ChannelCreate);
  },
};
