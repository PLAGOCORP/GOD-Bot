const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('Abre el panel web de God en botgod.pro'),
  async execute(interaction) {
    const url = config.dashboardUrl || 'https://botgod.pro';
    await interaction.reply({
      embeds: [
        embeds.god(
          'Dashboard · botgod.pro',
          [
            `🌐 **[${config.domain || 'botgod.pro'}](${url})**`,
            '',
            `• Landing: ${url}`,
            `• Login: ${url}/login`,
            `• Status: ${url}/status`,
            `• Features: ${url}/features`,
            '',
            'Inicia sesión con Discord para gestionar módulos, stats y roles de tus servidores.',
          ].join('\n')
        ),
      ],
      ephemeral: true,
    });
  },
};
