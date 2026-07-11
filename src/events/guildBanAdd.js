const { Events, AuditLogEvent } = require('discord.js');
const antinuke = require('../modules/antinuke');

module.exports = {
  name: Events.GuildBanAdd,
  async execute(ban) {
    await antinuke.fromAudit(ban.guild, 'ban', AuditLogEvent.MemberBanAdd);
  },
};
