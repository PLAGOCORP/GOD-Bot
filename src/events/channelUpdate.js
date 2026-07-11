const { Events } = require('discord.js');
const logging = require('../modules/logging');
const db = require('../database/db');

module.exports = {
  name: Events.ChannelUpdate,
  async execute(oldCh, newCh) {
    if (!newCh.guild || !db.isModuleEnabled(newCh.guild.id, 'logging')) return;
    if (oldCh.name === newCh.name && oldCh.topic === newCh.topic) return;
    await logging.sendLog(newCh.guild, 'role', {
      title: 'Canal actualizado',
      fields: [
        { name: 'Canal', value: `${newCh}` },
        { name: 'Nombre', value: `${oldCh.name} → ${newCh.name}` },
      ],
    });
  },
};
