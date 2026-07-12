const { Events, AttachmentBuilder } = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const { formatTemplate } = require('../utils/helpers');
const invites = require('../modules/invites');
const logging = require('../modules/logging');
const sticky = require('../modules/stickyRoles');
const antiraid = require('../modules/antiraid');
const { welcomeCard } = require('../utils/canvas');

module.exports = {
  name: Events.GuildMemberAdd,
  async execute(member) {
    await db.ensureGuild(member.guild.id);
    await db.ensureUser(member.guild.id, member.id);
    await db.updateUser(member.guild.id, member.id, { joined_at: Date.now() });

    // Anti-raid + account age
    await antiraid.onMemberJoin(member);

    // Sticky roles
    await sticky.restoreOnJoin(member);

    const used = await invites.trackJoin(member);
    const settings = await db.getGuildSettings(member.guild.id);

    if (settings.unverifiedRole) {
      await member.roles.add(settings.unverifiedRole).catch(() => {});
    }

    // Autoroles (skip if must verify first)
    if (await db.isModuleEnabled(member.guild.id, 'welcome') && !settings.unverifiedRole) {
      const { config: wr } = await db.getModuleConfig(member.guild.id, 'welcome');
      const roles = wr.autoroles || [];
      const delay = wr.autoroleDelayMs || 0;
      const apply = async () => {
        for (const rid of roles) {
          const role = member.guild.roles.cache.get(rid);
          if (role) await member.roles.add(role).catch(() => {});
        }
      };
      if (delay > 0) setTimeout(apply, delay);
      else await apply();
    }

    if (settings.welcomeChannel && await db.isModuleEnabled(member.guild.id, 'welcome')) {
      const ch = member.guild.channels.cache.get(settings.welcomeChannel);
      if (ch) {
        const text = formatTemplate(settings.welcomeMessage, {
          user: `${member}`,
          server: member.guild.name,
          count: member.guild.memberCount,
          avatar: member.user.displayAvatarURL(),
        });

        let files = [];
        const { config: wr } = await db.getModuleConfig(member.guild.id, 'welcome');
        if (wr.welcomeImage !== false) {
          try {
            const png = await welcomeCard({
              username: member.user.username,
              serverName: member.guild.name,
              memberCount: member.guild.memberCount,
            });
            files = [new AttachmentBuilder(png, { name: 'welcome.png' })];
          } catch { /* */ }
        }

        await ch
          .send({
            embeds: [
              embeds
                .god('Nuevo miembro', text)
                .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
                .setImage(files.length ? 'attachment://welcome.png' : null)
                .addFields(
                  {
                    name: 'Cuenta',
                    value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`,
                    inline: true,
                  },
                  {
                    name: 'Invitado por',
                    value: used?.inviterId ? `<@${used.inviterId}>` : 'Desconocido',
                    inline: true,
                  }
                ),
            ],
            files,
          })
          .catch(() => {});
      }
    }

    if (settings.welcomeDm) {
      await member
        .send({
          embeds: [
            embeds.god(
              `Bienvenido a ${member.guild.name}`,
              formatTemplate(settings.welcomeMessage, {
                user: member.user.username,
                server: member.guild.name,
                count: member.guild.memberCount,
              })
            ),
          ],
        })
        .catch(() => {});
    }

    await logging.sendLog(member.guild, 'member_join', {
      title: 'Miembro entró',
      user: member.user,
      fields: [
        { name: 'Usuario', value: `${member.user.tag} (\`${member.id}\`)` },
        { name: 'Invitación', value: used ? `\`${used.code}\` por <@${used.inviterId}>` : '—' },
        { name: 'Miembros', value: `${member.guild.memberCount}` },
      ],
    });
  },
};
