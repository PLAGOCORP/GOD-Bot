const { Events } = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const { formatTemplate } = require('../utils/helpers');
const logging = require('../modules/logging');
const sticky = require('../modules/stickyRoles');
const invites = require('../modules/invites');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(member) {
    // Guardar sticky antes de irse
    if (member.roles) {
      try {
        sticky.saveMemberSticky(member);
      } catch { /* partial member */ }
    }

    await invites.trackLeave(member);

    const settings = db.getGuildSettings(member.guild.id);

    if (settings.leaveChannel && db.isModuleEnabled(member.guild.id, 'welcome')) {
      const ch = member.guild.channels.cache.get(settings.leaveChannel);
      if (ch) {
        const text = formatTemplate(settings.leaveMessage, {
          user: member.user?.tag || 'Usuario',
          server: member.guild.name,
          count: member.guild.memberCount,
        });
        await ch
          .send({ embeds: [embeds.warning('Miembro salió', text)] })
          .catch(() => {});
      }
    }

    await logging.sendLog(member.guild, 'member_leave', {
      title: 'Miembro salió',
      user: member.user,
      fields: [
        { name: 'Usuario', value: `${member.user?.tag || '?'} (\`${member.id}\`)` },
        { name: 'Miembros', value: `${member.guild.memberCount}` },
      ],
    });
  },
};
