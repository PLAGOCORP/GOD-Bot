const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const { parseDuration, formatDuration } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('recordatorio')
    .setDescription('Te recuerdo algo en X tiempo')
    .addStringOption((o) => o.setName('tiempo').setDescription('Ej: 10m, 2h').setRequired(true))
    .addStringOption((o) => o.setName('mensaje').setDescription('Qué recordar').setRequired(true)),
  async execute(interaction) {
    const msVal = parseDuration(interaction.options.getString('tiempo'));
    const text = interaction.options.getString('mensaje');
    if (!msVal || msVal < 5000 || msVal > 30 * 86400000) {
      return interaction.reply({
        embeds: [embeds.error('Tiempo inválido', 'Entre 5s y 30d.')],
        ephemeral: true,
      });
    }
    await interaction.reply({
      embeds: [
        embeds.success(
          'Recordatorio',
          `Te avisaré en **${formatDuration(msVal)}** (<t:${Math.floor((Date.now() + msVal) / 1000)}:R>):\n${text}`
        ),
      ],
    });
    setTimeout(async () => {
      try {
        await interaction.user.send({
          embeds: [embeds.god('⏰ Recordatorio', text)],
        });
      } catch {
        await interaction.channel
          ?.send({ content: `${interaction.user} ⏰ **${text}**` })
          .catch(() => {});
      }
    }, msVal);
  },
};
