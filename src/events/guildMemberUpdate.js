const { Events } = require('discord.js');
const logging = require('../modules/logging');
const sticky = require('../modules/stickyRoles');
const db = require('../database/db');

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (!db.isModuleEnabled(newMember.guild.id, 'logging')) return;

    // Nickname
    if (oldMember.nickname !== newMember.nickname) {
      await logging.sendLog(newMember.guild, 'role', {
        title: 'Nickname cambiado',
        user: newMember.user,
        fields: [
          { name: 'Usuario', value: `${newMember.user.tag}` },
          { name: 'Antes', value: oldMember.nickname || oldMember.user.username },
          { name: 'Después', value: newMember.nickname || newMember.user.username },
        ],
      });
    }

    // Roles
    const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
    if (added.size || removed.size) {
      sticky.saveMemberSticky(newMember);
      await logging.sendLog(newMember.guild, 'role', {
        title: 'Roles actualizados',
        user: newMember.user,
        fields: [
          { name: 'Usuario', value: `${newMember}` },
          {
            name: 'Añadidos',
            value: added.map((r) => `${r}`).join(', ') || '—',
          },
          {
            name: 'Quitados',
            value: removed.map((r) => `${r}`).join(', ') || '—',
          },
        ],
      });
    }
  },
};
