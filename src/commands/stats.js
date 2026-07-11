const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const stats = require('../modules/statsChannels');
const { isAdmin } = require('../utils/permissions');
const { formatNumber } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Estadísticas del servidor y canales dinámicos')
    .addSubcommand((s) => s.setName('servidor').setDescription('Stats del servidor'))
    .addSubcommand((s) =>
      s
        .setName('usuario')
        .setDescription('Stats de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) =>
      s
        .setName('canales')
        .setDescription('Configura canales de voz dinámicos (admin)')
        .addChannelOption((o) =>
          o.setName('miembros').setDescription('Canal contador miembros').addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
        )
        .addChannelOption((o) =>
          o.setName('online').setDescription('Canal contador online').addChannelTypes(ChannelType.GuildVoice)
        )
        .addChannelOption((o) =>
          o.setName('boosts').setDescription('Canal contador boosts').addChannelTypes(ChannelType.GuildVoice)
        )
    )
    .addSubcommand((s) => s.setName('actualizar').setDescription('Fuerza update de canales stats')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'servidor') {
      const g = interaction.guild;
      await g.members.fetch().catch(() => {});
      const bots = g.members.cache.filter((m) => m.user.bot).size;
      return interaction.reply({
        embeds: [
          embeds
            .god(`📊 ${g.name}`, null)
            .setThumbnail(g.iconURL({ size: 256 }))
            .addFields(
              { name: 'Miembros', value: `${g.memberCount}`, inline: true },
              { name: 'Humanos', value: `${g.memberCount - bots}`, inline: true },
              { name: 'Bots', value: `${bots}`, inline: true },
              { name: 'Canales', value: `${g.channels.cache.size}`, inline: true },
              { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
              { name: 'Boosts', value: `${g.premiumSubscriptionCount || 0}`, inline: true }
            ),
        ],
      });
    }

    if (sub === 'usuario') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      const u = db.ensureUser(interaction.guild.id, user.id);
      return interaction.reply({
        embeds: [
          embeds
            .god(`Stats · ${user.username}`, null)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
              { name: 'XP texto', value: formatNumber(u.xp_text), inline: true },
              { name: 'XP voz', value: formatNumber(u.xp_voice), inline: true },
              { name: 'Mensajes', value: formatNumber(u.messages_count), inline: true },
              { name: 'Min. voz', value: formatNumber(u.voice_minutes || 0), inline: true },
              { name: 'Invites', value: formatNumber(u.invites_count), inline: true },
              { name: 'Warns', value: formatNumber(u.warns_count), inline: true },
              { name: 'Balance', value: formatNumber(u.balance), inline: true }
            ),
        ],
      });
    }

    if (sub === 'canales') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const sc = { ...(db.getGuildSettings(interaction.guild.id).statsChannels || {}) };
      const m = interaction.options.getChannel('miembros');
      const o = interaction.options.getChannel('online');
      const b = interaction.options.getChannel('boosts');
      if (m) sc.members = m.id;
      if (o) sc.online = o.id;
      if (b) sc.boosts = b.id;
      db.setGuildSettings(interaction.guild.id, { statsChannels: sc });
      db.setModuleEnabled(interaction.guild.id, 'stats', true);
      await stats.updateGuild(interaction.guild);
      return interaction.reply({ embeds: [embeds.success('Stats channels', 'Configurados y actualizados.')] });
    }

    if (sub === 'actualizar') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      await stats.updateGuild(interaction.guild);
      return interaction.reply({ embeds: [embeds.success('Stats', 'Canales actualizados.')] });
    }
  },
};
