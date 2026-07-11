const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const conf = require('../modules/confessions');
const db = require('../database/db');
const { isAdmin, isMod } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('confesar')
    .setDescription('Envía una confesión anónima (revisión de staff)')
    .addSubcommand((s) => s.setName('enviar').setDescription('Abrir formulario de confesión'))
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Canales de confesiones (admin)')
        .addChannelOption((o) =>
          o
            .setName('publicacion')
            .setDescription('Canal público de confesiones')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption((o) =>
          o
            .setName('revision')
            .setDescription('Canal staff de revisión')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'enviar') {
      if (!db.isModuleEnabled(interaction.guild.id, 'confessions')) {
        return interaction.reply({ embeds: [embeds.error('Confesiones desactivadas')], ephemeral: true });
      }
      return interaction.showModal(conf.confessModal());
    }
    if (sub === 'config') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const pub = interaction.options.getChannel('publicacion');
      const rev = interaction.options.getChannel('revision');
      db.setGuildSettings(interaction.guild.id, {
        confessionChannel: pub.id,
        confessionReviewChannel: rev.id,
      });
      db.setModuleEnabled(interaction.guild.id, 'confessions', true);
      return interaction.reply({
        embeds: [embeds.success('Confesiones', `Público: ${pub}\nRevisión: ${rev}`)],
      });
    }
  },
};
