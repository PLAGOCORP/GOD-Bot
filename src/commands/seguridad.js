const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('seguridad')
    .setDescription('Anti-nuke, anti-raid y verificación')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('antinuke')
        .setDescription('Activa/desactiva anti-nuke')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('umbral').setDescription('Acciones para disparar').setMinValue(2).setMaxValue(20)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('antiraid')
        .setDescription('Joins masivos')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
        .addIntegerOption((o) =>
          o.setName('umbral').setDescription('Joins en ventana').setMinValue(3).setMaxValue(50)
        )
        .addIntegerOption((o) =>
          o.setName('edad_min_horas').setDescription('Edad mínima de cuenta (horas)').setMinValue(0)
        )
        .addBooleanOption((o) => o.setName('kick_nuevas').setDescription('Kick cuentas muy nuevas'))
    )
    .addSubcommand((s) =>
      s
        .setName('quiz')
        .setDescription('Publica verificación con quiz simple')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol al acertar').setRequired(true))
        .addStringOption((o) =>
          o.setName('pregunta').setDescription('Pregunta').setRequired(true)
        )
        .addStringOption((o) =>
          o.setName('respuesta').setDescription('Respuesta correcta (una palabra/número)').setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName('status').setDescription('Estado de seguridad')),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'antinuke') {
      const activo = interaction.options.getBoolean('activo');
      const umbral = interaction.options.getInteger('umbral');
      await db.setModuleEnabled(interaction.guild.id, 'antinuke', activo);
      if (umbral) await db.setGuildSettings(interaction.guild.id, { antinukeThreshold: umbral });
      return interaction.reply({
        embeds: [
          embeds.success(
            'Anti-Nuke',
            `${activo ? 'ON' : 'OFF'}${umbral ? ` · umbral ${umbral}` : ''}`
          ),
        ],
      });
    }

    if (sub === 'antiraid') {
      const activo = interaction.options.getBoolean('activo');
      const umbral = interaction.options.getInteger('umbral');
      const edad = interaction.options.getInteger('edad_min_horas');
      const kick = interaction.options.getBoolean('kick_nuevas');
      await db.setModuleEnabled(interaction.guild.id, 'antiraid', activo);
      const patch = {};
      if (umbral) patch.antiraidThreshold = umbral;
      if (edad !== null && edad !== undefined) patch.minAccountAgeHours = edad;
      if (kick !== null && kick !== undefined) patch.kickNewAccounts = kick;
      await db.setGuildSettings(interaction.guild.id, patch);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Anti-Raid',
            `${activo ? 'ON' : 'OFF'}\nUmbral joins: ${umbral || 'default'}\nEdad mín: ${edad ?? '—'}h\nKick nuevas: ${kick ?? '—'}`
          ),
        ],
      });
    }

    if (sub === 'quiz') {
      const rol = interaction.options.getRole('rol');
      const pregunta = interaction.options.getString('pregunta');
      const respuesta = interaction.options.getString('respuesta').trim().toLowerCase();
      await db.setGuildSettings(interaction.guild.id, {
        verifiedRole: rol.id,
        verifyQuiz: { pregunta, respuesta },
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_quiz_start')
          .setLabel('Iniciar verificación')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );
      await interaction.channel.send({
        embeds: [
          embeds.god(
            'Verificación',
            `Para acceder, pulsa el botón y responde el quiz.\n\n**Pregunta de ejemplo (visible):**\n${pregunta}`
          ),
        ],
        components: [row],
      });
      return interaction.reply({ content: '✅ Panel quiz publicado.', ephemeral: true });
    }

    if (sub === 'status') {
      const s = await db.getGuildSettings(interaction.guild.id);
      return interaction.reply({
        embeds: [
          embeds.info(
            'Seguridad',
            [
              `Anti-nuke: ${await db.isModuleEnabled(interaction.guild.id, 'antinuke') ? 'ON' : 'OFF'} (${s.antinukeThreshold || 3})`,
              `Anti-raid: ${await db.isModuleEnabled(interaction.guild.id, 'antiraid') ? 'ON' : 'OFF'} (${s.antiraidThreshold || 8})`,
              `Edad mín cuenta: ${s.minAccountAgeHours || 0}h`,
              `Kick nuevas: ${s.kickNewAccounts ? 'sí' : 'no'}`,
              `Rol verificado: ${s.verifiedRole ? `<@&${s.verifiedRole}>` : '—'}`,
              `Quiz: ${s.verifyQuiz ? 'configurado' : 'no'}`,
            ].join('\n')
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
