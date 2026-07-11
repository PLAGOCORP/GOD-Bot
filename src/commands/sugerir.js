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
    .setName('sugerir')
    .setDescription('Sistema de sugerencias')
    .addSubcommand((s) =>
      s
        .setName('enviar')
        .setDescription('Envía una sugerencia')
        .addStringOption((o) => o.setName('texto').setDescription('Tu sugerencia').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('canal')
        .setDescription('Define canal de sugerencias (admin)')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'canal') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const ch = interaction.options.getChannel('canal');
      db.setGuildSettings(interaction.guild.id, { suggestionChannel: ch.id });
      return interaction.reply({ embeds: [embeds.success('Sugerencias', `Canal: ${ch}`)] });
    }

    if (sub === 'enviar') {
      const texto = interaction.options.getString('texto');
      const settings = db.getGuildSettings(interaction.guild.id);
      const chId = settings.suggestionChannel;
      if (!chId) {
        return interaction.reply({
          embeds: [embeds.error('No hay canal de sugerencias. Un admin debe usar `/sugerir canal`.')],
          ephemeral: true,
        });
      }
      const ch = interaction.guild.channels.cache.get(chId);
      if (!ch) {
        return interaction.reply({ embeds: [embeds.error('Canal de sugerencias inválido')], ephemeral: true });
      }

      const info = db.db
        .prepare(
          'INSERT INTO suggestions (guild_id, user_id, content, status) VALUES (?, ?, ?, ?)'
        )
        .run(interaction.guild.id, interaction.user.id, texto, 'pending');
      const id = info.lastInsertRowid;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`sug_approve:${id}`)
          .setLabel('Aprobar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`sug_deny:${id}`)
          .setLabel('Rechazar')
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await ch.send({
        embeds: [
          embeds
            .god(`💡 Sugerencia #${id}`, texto)
            .setFooter({ text: `Por ${interaction.user.tag}` }),
        ],
        components: [row],
      });
      await msg.react('👍').catch(() => {});
      await msg.react('👎').catch(() => {});
      db.db
        .prepare('UPDATE suggestions SET message_id = ?, channel_id = ? WHERE id = ?')
        .run(msg.id, ch.id, id);

      return interaction.reply({
        embeds: [embeds.success('Sugerencia enviada', `ID #${id} en ${ch}`)],
        ephemeral: true,
      });
    }
  },
};
