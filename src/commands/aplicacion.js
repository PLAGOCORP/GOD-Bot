const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const apps = require('../modules/applications');
const db = require('../database/db');
const { isAdmin, isMod } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('aplicacion')
    .setDescription('Formularios / aplicaciones del servidor')
    .addSubcommand((s) =>
      s
        .setName('crear')
        .setDescription('Crea un tipo de aplicación')
        .addStringOption((o) => o.setName('tipo').setDescription('ID tipo ej: staff').setRequired(true))
        .addStringOption((o) => o.setName('titulo').setDescription('Título').setRequired(true))
        .addChannelOption((o) =>
          o
            .setName('revision')
            .setDescription('Canal de revisión')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción'))
        .addRoleOption((o) => o.setName('rol_aprobar').setDescription('Rol al aprobar'))
    )
    .addSubcommand((s) =>
      s
        .setName('aplicar')
        .setDescription('Rellena una aplicación')
        .addStringOption((o) => o.setName('tipo').setDescription('Tipo').setRequired(true))
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Lista tipos de aplicación')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'crear') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const tipo = interaction.options.getString('tipo');
      const titulo = interaction.options.getString('titulo');
      const descripcion = interaction.options.getString('descripcion') || '';
      const revision = interaction.options.getChannel('revision');
      const rol = interaction.options.getRole('rol_aprobar');
      await apps.createType(interaction.guild.id, tipo, titulo, descripcion, revision.id, rol?.id, [
        '¿Por qué te postulas?',
        '¿Qué experiencia tienes?',
        '¿Cuál es tu disponibilidad?',
      ]);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Aplicación creada',
            `Tipo \`${tipo}\` → revisión en ${revision}\nLos usuarios usan \`/aplicacion aplicar tipo:${tipo}\``
          ),
        ],
      });
    }

    if (sub === 'aplicar') {
      const tipo = interaction.options.getString('tipo');
      const typeRow = await apps.getType(interaction.guild.id, tipo);
      if (!typeRow) {
        return interaction.reply({ embeds: [embeds.error('Tipo no existe')], ephemeral: true });
      }
      const questions = JSON.parse(typeRow.questions_json || '[]');
      return interaction.showModal(apps.applyModal(tipo, questions));
    }

    if (sub === 'lista') {
      const list = await apps.listTypes(interaction.guild.id);
      if (!list.length) {
        return interaction.reply({ embeds: [embeds.info('Aplicaciones', 'Ninguna. `/aplicacion crear`')] });
      }
      return interaction.reply({
        embeds: [
          embeds.god(
            'Tipos de aplicación',
            list.map((t) => `• \`${t.type}\` — **${t.title}**`).join('\n')
          ),
        ],
      });
    }
  },
};
