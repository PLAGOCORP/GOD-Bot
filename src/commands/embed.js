const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ChannelType,
  EmbedBuilder,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isMod } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('embed')
    .setDescription('Constructor de embeds')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((s) => s.setName('crear').setDescription('Abre el constructor (modal)'))
    .addSubcommand((s) =>
      s
        .setName('enviar')
        .setDescription('Envía embed rápido')
        .addStringOption((o) => o.setName('titulo').setDescription('Título').setRequired(true))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción').setRequired(true))
        .addStringOption((o) => o.setName('color').setDescription('Hex sin #'))
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal destino').addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('guardar')
        .setDescription('Guarda plantilla de embed')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre plantilla').setRequired(true))
        .addStringOption((o) => o.setName('titulo').setDescription('Título').setRequired(true))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción').setRequired(true))
        .addStringOption((o) => o.setName('color').setDescription('Hex'))
    )
    .addSubcommand((s) =>
      s
        .setName('plantilla')
        .setDescription('Envía una plantilla guardada')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre').setRequired(true))
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Lista plantillas')),
  async execute(interaction) {
    if (!await isMod(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Sin permisos')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'crear') {
      const modal = new ModalBuilder().setCustomId('embed_modal').setTitle('Constructor de Embed');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('titulo')
            .setLabel('Título')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(256)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('descripcion')
            .setLabel('Descripción')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(4000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('color')
            .setLabel('Color hex (sin #)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue('9B59B6')
            .setMaxLength(6)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('imagen')
            .setLabel('URL imagen (opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('footer')
            .setLabel('Footer (opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );
      return interaction.showModal(modal);
    }

    if (sub === 'enviar') {
      const titulo = interaction.options.getString('titulo');
      const descripcion = interaction.options.getString('descripcion');
      const color = interaction.options.getString('color');
      const canal = interaction.options.getChannel('canal') || interaction.channel;
      const e = new EmbedBuilder()
        .setTitle(titulo)
        .setDescription(descripcion)
        .setColor(color ? parseInt(color, 16) : 0x9b59b6)
        .setTimestamp();
      await canal.send({ embeds: [e] });
      return interaction.reply({ content: `✅ Enviado a ${canal}`, ephemeral: true });
    }

    if (sub === 'guardar') {
      const nombre = interaction.options.getString('nombre').toLowerCase();
      const data = {
        title: interaction.options.getString('titulo'),
        description: interaction.options.getString('descripcion'),
        color: interaction.options.getString('color') || '9B59B6',
      };
      await db.setEmbedTemplate(interaction.guild.id, nombre, data, interaction.user.id);
      return interaction.reply({ embeds: [embeds.success('Plantilla guardada', `\`${nombre}\``)] });
    }

    if (sub === 'plantilla') {
      const nombre = interaction.options.getString('nombre').toLowerCase();
      const row = await db.getEmbedTemplate(interaction.guild.id, nombre);
      if (!row) {
        return interaction.reply({ embeds: [embeds.error('Plantilla no existe')], ephemeral: true });
      }
      const data = typeof row.data_json === 'string' ? JSON.parse(row.data_json) : (row.data_json || {});
      const canal = interaction.options.getChannel('canal') || interaction.channel;
      await canal.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(data.title)
            .setDescription(data.description)
            .setColor(parseInt(data.color || '9B59B6', 16))
            .setTimestamp(),
        ],
      });
      return interaction.reply({ content: `✅ Enviado a ${canal}`, ephemeral: true });
    }

    if (sub === 'lista') {
      const admin = require('firebase-admin');
      const fDb = admin.firestore();
      const listSnap = await fDb.collection('embedTemplates')
        .where('guild_id', '==', interaction.guild.id)
        .get();
      const list = listSnap.docs.map((d) => ({ name: d.data().name }));
      return interaction.reply({
        embeds: [
          embeds.info(
            'Plantillas embed',
            list.length ? list.map((t) => `\`${t.name}\``).join(', ') : 'Ninguna.'
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
