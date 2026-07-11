const { Events, AuditLogEvent } = require('discord.js');
const antinuke = require('../modules/antinuke');

module.exports = {
  name: Events.GuildRoleDelete,
  async execute(role) {
    await antinuke.fromAudit(role.guild, 'role_delete', AuditLogEvent.RoleDelete);
  },
};
