const { Events } = require('discord.js');
const logging = require('../modules/logging');

module.exports = {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild || message.partial) return;
    await logging.logMessageDelete(message);
  },
};
