const { Events } = require('discord.js');
const tempvc = require('../modules/tempvc');
const voiceXp = require('../modules/voiceXp');
const db = require('../database/db');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return;

    // Voice XP tracking join/leave
    if (!oldState.channelId && newState.channelId) {
      voiceXp.onJoin(newState.guild.id, member.id);
    }
    if (oldState.channelId && !newState.channelId) {
      voiceXp.onLeave(oldState.guild.id, member.id);
    }

    // Cleanup empty temp VCs shortly after leave
    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      const row = await db.getTempChannel(oldState.channelId);
      if (row) {
        setTimeout(() => tempvc.cleanupEmpty(client), 3000);
      }
    }
  },
};
