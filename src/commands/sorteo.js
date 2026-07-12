const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const giveaways = require('../modules/giveaways');
const { parseDuration } = require('../utils/helpers');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sorteo')
    .setDescription('Giveaways / sorteos')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) =>
      s
        .setName('crear')
        .setDescription('Crea un sorteo')
        .addStringOption((o) => o.setName('premio').setDescription('Premio').setRequired(true))
        .addStringOption((o) => o.setName('duracion').setDescription('Ej: 1h, 30m, 1d').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('ganadores').setDescription('Nº ganadores').setMinValue(1).setMaxValue(20)
        )
        .addIntegerOption((o) =>
          o.setName('nivel_min').setDescription('Nivel mínimo para participar').setMinValue(0)
        )
        .addRoleOption((o) => o.setName('rol_req').setDescription('Rol requerido'))
        .addIntegerOption((o) =>
          o.setName('dias_en_server').setDescription('Días mínimos en el servidor').setMinValue(0)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('terminar')
        .setDescription('Termina un sorteo ahora')
        .addStringOption((o) => o.setName('id').setDescription('ID del sorteo').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('reroll')
        .setDescription('Reelige ganadores')
        .addStringOption((o) => o.setName('id').setDescription('ID del sorteo').setRequired(true))
    ),
  async execute(interaction, client) {
    if (!await db.isModuleEnabled(interaction.guild.id, 'giveaways')) {
      return interaction.reply({ embeds: [embeds.error('Módulo sorteos desactivado')], ephemeral: true });
    }
    if (!isAdmin(interaction.member) && !interaction.memberPermissions?.has('ManageGuild')) {
      return interaction.reply({ embeds: [embeds.error('Sin permisos')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'crear') {
      const prize = interaction.options.getString('premio');
      const duration = parseDuration(interaction.options.getString('duracion'));
      const winners = interaction.options.getInteger('ganadores') || 1;
      if (!duration || duration < 10_000) {
        return interaction.reply({
          embeds: [embeds.error('Duración inválida', 'Mín. 10s.')],
          ephemeral: true,
        });
      }
      const requirements = {
        minLevel: interaction.options.getInteger('nivel_min') || 0,
        roleId: interaction.options.getRole('rol_req')?.id || null,
        minDays: interaction.options.getInteger('dias_en_server') || 0,
      };
      const id = Date.now().toString(36);
      const endsAt = Date.now() + duration;
      const g = {
        id,
        guild_id: interaction.guild.id,
        channel_id: interaction.channel.id,
        message_id: '',
        prize,
        winners_count: winners,
        end_timestamp: endsAt,
        requirements_json: requirements,
        entrants_json: [],
        ended: 0,
        host_id: interaction.user.id,
      };
      const reqLines = [];
      if (requirements.minLevel) reqLines.push(`Nivel ≥ **${requirements.minLevel}**`);
      if (requirements.roleId) reqLines.push(`Rol <@&${requirements.roleId}>`);
      if (requirements.minDays) reqLines.push(`${requirements.minDays}d en el server`);

      const emb = giveaways.buildEmbed(
        { ...g, entrants: [], winners_count: winners, end_timestamp: endsAt, requirements },
        client.user
      );
      if (reqLines.length) emb.addFields({ name: 'Requisitos', value: reqLines.join('\n') });

      const msg = await interaction.reply({
        embeds: [emb],
        components: giveaways.buildComponents(id),
        fetchReply: true,
      });
      g.message_id = msg.id;
      await db.saveGiveaway(g);
      return;
    }

    if (sub === 'terminar') {
      const id = interaction.options.getString('id');
      const g = await db.getGiveaway(id);
      if (!g || g.guild_id !== interaction.guild.id) {
        return interaction.reply({ embeds: [embeds.error('Sorteo no encontrado')], ephemeral: true });
      }
      if (g.ended) {
        return interaction.reply({ embeds: [embeds.error('Ya terminó')], ephemeral: true });
      }
      await giveaways.endGiveaway(client, g);
      return interaction.reply({ embeds: [embeds.success('Sorteo terminado', `ID \`${id}\``)] });
    }

    if (sub === 'reroll') {
      const id = interaction.options.getString('id');
      const g = await db.getGiveaway(id);
      if (!g || g.guild_id !== interaction.guild.id) {
        return interaction.reply({ embeds: [embeds.error('Sorteo no encontrado')], ephemeral: true });
      }
      g.ended = false;
      const winners = await giveaways.endGiveaway(client, g);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Reroll',
            winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'Sin participantes.'
          ),
        ],
      });
    }
  },
};
