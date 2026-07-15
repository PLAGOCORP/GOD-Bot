const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const tickets = require('../modules/tickets');
const { isAdmin, isMod } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Sistema de tickets profesional')
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('Publica el panel de tickets en este canal')
        .addStringOption((o) => o.setName('titulo').setDescription('Título del panel'))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción'))
    )
    .addSubcommand((s) =>
      s
        .setName('abrir')
        .setDescription('Abre un ticket manualmente')
        .addStringOption((o) => o.setName('asunto').setDescription('Asunto'))
    )
    .addSubcommand((s) =>
      s
        .setName('cerrar')
        .setDescription('Cierra el ticket actual')
        .addStringOption((o) => o.setName('razon').setDescription('Razón de cierre'))
    )
    .addSubcommand((s) =>
      s
        .setName('categoria')
        .setDescription('Define la categoría de Discord para tickets')
        .addChannelOption((o) =>
          o
            .setName('categoria')
            .setDescription('Categoría de canales')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('log')
        .setDescription('Canal de transcripts')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    ),
  async execute(interaction, client) {
    if (!await db.isModuleEnabled(interaction.guild.id, 'tickets')) {
      return interaction.reply({ embeds: [embeds.error('Módulo tickets desactivado')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'panel') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const titulo = interaction.options.getString('titulo') || 'Centro de soporte — God';
      const desc =
        interaction.options.getString('descripcion') ||
        'Selecciona una categoría para abrir un **ticket privado** con el staff.\nUn ticket a la vez. Sé claro y educado.';
      await interaction.channel.send({
        embeds: [embeds.god(`🎫 ${titulo}`, desc)],
        components: tickets.panelComponents(),
      });
      return interaction.reply({ content: '✅ Panel publicado.', ephemeral: true });
    }

    if (sub === 'abrir') {
      await interaction.deferReply({ ephemeral: true });
      const asunto = interaction.options.getString('asunto') || 'Soporte general';
      const result = await tickets.createTicketChannel(interaction, 'general', asunto);
      if (result.error) return interaction.editReply({ content: result.error });
      return interaction.editReply({
        embeds: [embeds.success('Ticket creado', `${result.channel}`)],
      });
    }

    if (sub === 'cerrar') {
      if (!await isMod(interaction.member) && !interaction.channel?.topic?.includes(interaction.user.id)) {
        return interaction.reply({ embeds: [embeds.error('Sin permiso')], ephemeral: true });
      }
      return tickets.closeTicket(interaction);
    }

    if (sub === 'categoria') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const cat = interaction.options.getChannel('categoria');
      await db.setGuildSettings(interaction.guild.id, { ticketCategory: cat.id });
      return interaction.reply({
        embeds: [embeds.success('Categoría de tickets', `Tickets se crearán bajo **${cat.name}**.`)],
      });
    }

    if (sub === 'log') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const ch = interaction.options.getChannel('canal');
      await db.setGuildSettings(interaction.guild.id, { ticketLog: ch.id });
      return interaction.reply({ embeds: [embeds.success('Ticket logs', `Transcripts → ${ch}`)] });
    }
  },
};
