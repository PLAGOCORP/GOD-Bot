const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const invites = require('../modules/invites');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Tracker de invitaciones')
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Invites de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) => s.setName('top').setDescription('Top invitadores'))
    .addSubcommand((s) =>
      s
        .setName('recompensa')
        .setDescription('Rol al alcanzar X invites (admin)')
        .addIntegerOption((o) =>
          o.setName('cantidad').setDescription('Nº de invites').setRequired(true).setMinValue(1)
        )
        .addRoleOption((o) => o.setName('rol').setDescription('Rol recompensa').setRequired(true))
    ),
  async execute(interaction) {
    if (!db.isModuleEnabled(interaction.guild.id, 'invites')) {
      return interaction.reply({ embeds: [embeds.error('Módulo invites desactivado')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'ver') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      const count = invites.getUserInvites(interaction.guild.id, user.id);
      const fakes = invites.fakeCount(interaction.guild.id, user.id);
      return interaction.reply({
        embeds: [
          embeds.god(
            '📨 Invites',
            `**${user.tag}**\nInvites: **${count}**\nFake (left rápido): **${fakes}**`
          ),
        ],
      });
    }
    if (sub === 'top') {
      const board = invites.topInvites(interaction.guild.id, 10);
      if (!board.length) {
        return interaction.reply({ embeds: [embeds.info('Top invites', 'Sin datos aún.')] });
      }
      const lines = board.map((e, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `\`#${i + 1}\``;
        return `${medal} <@${e.user_id}> — **${e.invites_count}** invites`;
      });
      return interaction.reply({ embeds: [embeds.god('📨 Top invites', lines.join('\n'))] });
    }
    if (sub === 'recompensa') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const n = interaction.options.getInteger('cantidad');
      const rol = interaction.options.getRole('rol');
      const cur = db.getModuleConfig(interaction.guild.id, 'invites');
      const rewards = { ...(cur.config.rewards || {}), [String(n)]: rol.id };
      db.setModuleConfig(interaction.guild.id, 'invites', { rewards });
      return interaction.reply({
        embeds: [embeds.success('Recompensa invites', `Al llegar a **${n}** → ${rol}`)],
      });
    }
  },
};
