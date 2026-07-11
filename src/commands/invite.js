const { SlashCommandBuilder, OAuth2Scopes, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder().setName('invite').setDescription('Invita a God a tu servidor'),
  async execute(interaction, client) {
    const url = client.generateInvite({
      scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
      permissions: [PermissionFlagsBits.Administrator],
    });
    await interaction.reply({
      embeds: [
        embeds.god(
          'Invitar a God',
          `[Haz clic aquí](${url})\n\nRecomendado: **Administrator** para tickets, logs, roles y automod sin fricción.`
        ),
      ],
    });
  },
};
