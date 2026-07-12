const { Events, AuditLogEvent } = require('discord.js');
const antinuke = require('../modules/antinuke');
const db = require('../database/db');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    await db.deleteTempChannel(channel.id);
    await antinuke.fromAudit(channel.guild, 'channel_delete', AuditLogEvent.ChannelDelete);
  },
};
