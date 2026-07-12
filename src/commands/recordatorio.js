const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const { parseDuration, formatDuration } = require('../utils/helpers');
const db = require('../database/db');
const { scheduleReminder } = require('../modules/reminders');

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
    const remindAt = Date.now() + msVal;
    try {
      db.db.prepare('INSERT INTO reminders (user_id, guild_id, channel_id, content, remind_at) VALUES (?, ?, ?, ?, ?)').run(
        interaction.user.id,
        interaction.guild?.id || null,
        interaction.channel?.id || null,
        text,
        remindAt
      );
      const row = db.db.prepare('SELECT * FROM reminders WHERE user_id = ? AND remind_at = ? ORDER BY id DESC LIMIT 1').get(interaction.user.id, remindAt);
      if (row) scheduleReminder(row, interaction.client);
    } catch { /* */ }
    await interaction.reply({
      embeds: [
        embeds.success(
          'Recordatorio',
          `Te avisaré en **${formatDuration(msVal)}** (<t:${Math.floor(remindAt / 1000)}:R>):\n${text}`
        ),
      ],
    });
  },
};
