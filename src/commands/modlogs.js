const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isMod } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription('Historial de moderación / drama overview')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Ver logs recientes de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addIntegerOption((o) => o.setName('limite').setDescription('1-25').setMinValue(1).setMaxValue(25))
    )
    .addSubcommand((s) =>
      s
        .setName('recientes')
        .setDescription('Últimas acciones del servidor')
        .addIntegerOption((o) => o.setName('limite').setDescription('1-25').setMinValue(1).setMaxValue(25))
    ),
  async execute(interaction) {
    if (!isMod(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Sin permisos')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const limit = interaction.options.getInteger('limite') || 10;

    if (sub === 'ver') {
      const user = interaction.options.getUser('usuario');
      const warns = db.listWarns(interaction.guild.id, user.id);
      const logs = db
        .recentLogs(interaction.guild.id, 50)
        .filter((l) => l.target_id === user.id || l.user_id === user.id)
        .slice(0, limit);
      const body = [
        `**Warns activos:** ${warns.length}`,
        ...warns.slice(0, 5).map((w) => `• #${w.id} ${w.reason}`),
        '',
        '**Logs recientes:**',
        ...(logs.length
          ? logs.map(
              (l) =>
                `• \`${l.type}\` <t:${Math.floor(l.timestamp / 1000)}:R>`
            )
          : ['—']),
      ].join('\n');
      return interaction.reply({
        embeds: [embeds.mod(`Modlogs · ${user.tag}`, body)],
        ephemeral: true,
      });
    }

    if (sub === 'recientes') {
      const logs = db.recentLogs(interaction.guild.id, limit);
      if (!logs.length) {
        return interaction.reply({ embeds: [embeds.info('Logs', 'Sin registros aún.')], ephemeral: true });
      }
      const body = logs
        .map(
          (l) =>
            `• **${l.type}** · target:\`${l.target_id || '—'}\` · <t:${Math.floor(l.timestamp / 1000)}:R>`
        )
        .join('\n');
      return interaction.reply({
        embeds: [embeds.mod('Drama / logs recientes', body)],
        ephemeral: true,
      });
    }
  },
};
