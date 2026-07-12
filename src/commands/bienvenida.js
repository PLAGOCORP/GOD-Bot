const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bienvenida')
    .setDescription('Bienvenidas, despedidas y verificación')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('canal')
        .setDescription('Canal de bienvenida')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('despedida')
        .setDescription('Canal de despedida')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('mensaje')
        .setDescription('Mensaje de bienvenida ({user} {server} {count})')
        .addStringOption((o) => o.setName('texto').setDescription('Texto').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('dm')
        .setDescription('DM de bienvenida')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('verificacion')
        .setDescription('Panel de verificación con botón')
        .addRoleOption((o) => o.setName('rol_verificado').setDescription('Rol al verificar').setRequired(true))
        .addRoleOption((o) => o.setName('rol_no_verificado').setDescription('Rol pre-verificación'))
    )
    .addSubcommand((s) =>
      s
        .setName('imagen')
        .setDescription('Activa/desactiva welcome card PNG')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    ),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'canal') {
      const ch = interaction.options.getChannel('canal');
      await db.setGuildSettings(gid, { welcomeChannel: ch.id });
      return interaction.reply({ embeds: [embeds.success('Bienvenida', `Canal: ${ch}`)] });
    }
    if (sub === 'despedida') {
      const ch = interaction.options.getChannel('canal');
      await db.setGuildSettings(gid, { leaveChannel: ch.id });
      return interaction.reply({ embeds: [embeds.success('Despedida', `Canal: ${ch}`)] });
    }
    if (sub === 'mensaje') {
      const texto = interaction.options.getString('texto');
      await db.setGuildSettings(gid, { welcomeMessage: texto });
      return interaction.reply({ embeds: [embeds.success('Mensaje guardado', texto)] });
    }
    if (sub === 'dm') {
      const activo = interaction.options.getBoolean('activo');
      await db.setGuildSettings(gid, { welcomeDm: activo });
      return interaction.reply({ embeds: [embeds.success('DM bienvenida', activo ? 'ON' : 'OFF')] });
    }
    if (sub === 'verificacion') {
      const verified = interaction.options.getRole('rol_verificado');
      const unverified = interaction.options.getRole('rol_no_verificado');
      await db.setGuildSettings(gid, {
        verifiedRole: verified.id,
        unverifiedRole: unverified?.id || null,
        verificationChannel: interaction.channel.id,
      });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('verify_me')
          .setLabel('Verificarme')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅')
      );
      await interaction.channel.send({
        embeds: [
          embeds.god(
            'Verificación',
            'Pulsa el botón para aceptar las reglas y obtener acceso al servidor.\n¡Por el poder de God!'
          ),
        ],
        components: [row],
      });
      return interaction.reply({ content: '✅ Panel de verificación publicado.', ephemeral: true });
    }

    if (sub === 'imagen') {
      const activo = interaction.options.getBoolean('activo');
      await db.setModuleConfig(gid, 'welcome', { welcomeImage: activo });
      return interaction.reply({
        embeds: [embeds.success('Welcome card', activo ? 'PNG activado en joins' : 'Solo embed')],
      });
    }
  },
};
