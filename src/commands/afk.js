const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Márquese como AFK')
    .addStringOption((o) => o.setName('razon').setDescription('Razón')),
  async execute(interaction) {
    const reason = interaction.options.getString('razon') || 'AFK';
    await db.setAfk(interaction.guild.id, interaction.user.id, reason);
    await interaction.reply({
      embeds: [embeds.success('AFK', `Ahora estás AFK: **${reason}**`)],
    });
  },
};
