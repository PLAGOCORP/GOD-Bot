const { Events, AuditLogEvent } = require('discord.js');
const antinuke = require('../modules/antinuke');
const db = require('../database/db');

module.exports = {
  name: Events.ChannelDelete,
  async execute(channel) {
    if (!channel.guild) return;
    db.db.prepare('DELETE FROM temp_channels WHERE channel_id = ?').run(channel.id);
    await antinuke.fromAudit(channel.guild, 'channel_delete', AuditLogEvent.ChannelDelete);
  },
};
