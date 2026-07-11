const { Events } = require('discord.js');
const logging = require('../modules/logging');

module.exports = {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || newMessage.partial) return;
    if (oldMessage.partial) {
      try {
        oldMessage = await oldMessage.fetch();
      } catch {
        return;
      }
    }
    await logging.logMessageEdit(oldMessage, newMessage);
  },
};
