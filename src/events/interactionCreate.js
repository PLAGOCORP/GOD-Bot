const { Events } = require('discord.js');
const { route } = require('../handlers/interactionRouter');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    await route(interaction, client);
  },
};
