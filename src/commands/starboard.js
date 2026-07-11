const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configura el starboard / highlights')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('configurar')
        .setDescription('Canal, emoji y mínimo de stars')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal starboard').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji (default ⭐)'))
        .addIntegerOption((o) =>
          o.setName('minimo').setDescription('Mínimo de reacciones').setMinValue(1).setMaxValue(50)
        )
    )
    .addSubcommand((s) => s.setName('status').setDescription('Ver configuración')),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    if (sub === 'configurar') {
      const canal = interaction.options.getChannel('canal');
      const emoji = interaction.options.getString('emoji') || '⭐';
      const min = interaction.options.getInteger('minimo') || 3;
      db.setGuildSettings(interaction.guild.id, {
        starboardChannel: canal.id,
        starboardEmoji: emoji,
        starboardMin: min,
      });
      db.setModuleEnabled(interaction.guild.id, 'starboard', true);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Starboard',
            `Canal: ${canal}\nEmoji: ${emoji}\nMínimo: **${min}**`
          ),
        ],
      });
    }
    if (sub === 'status') {
      const s = db.getGuildSettings(interaction.guild.id);
      return interaction.reply({
        embeds: [
          embeds.info(
            'Starboard',
            `Canal: ${s.starboardChannel ? `<#${s.starboardChannel}>` : '—'}\nEmoji: ${s.starboardEmoji || '⭐'}\nMín: ${s.starboardMin || 3}`
          ),
        ],
        ephemeral: true,
      });
    }
  },
};
