const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const tempvc = require('../modules/tempvc');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tempvc')
    .setDescription('Canales de voz temporales')
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('Publica el panel de creación de VC temporal')
    )
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Configura categoría y límite')
        .addChannelOption((o) =>
          o
            .setName('categoria')
            .setDescription('Categoría para los VCs')
            .addChannelTypes(ChannelType.GuildCategory)
        )
        .addIntegerOption((o) =>
          o.setName('limite').setDescription('Máx VCs por usuario').setMinValue(1).setMaxValue(10)
        )
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      await interaction.channel.send({
        embeds: [
          embeds.god(
            '🔊 VC Temporal',
            'Pulsa el botón para crear tu propio canal de voz.\nSe elimina solo cuando queda vacío.'
          ),
        ],
        components: tempvc.panelComponents(),
      });
      return interaction.reply({ content: '✅ Panel publicado.', ephemeral: true });
    }
    if (sub === 'config') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const cat = interaction.options.getChannel('categoria');
      const limite = interaction.options.getInteger('limite');
      const patch = {};
      if (cat) patch.tempvcCategory = cat.id;
      if (limite) patch.tempvcLimit = limite;
      await db.setGuildSettings(interaction.guild.id, patch);
      return interaction.reply({ embeds: [embeds.success('TempVC', 'Configuración guardada.')] });
    }
  },
};
