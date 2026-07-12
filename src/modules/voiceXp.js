const db = require('../database/db');
const config = require('../config');
const { levelFromXp } = require('../utils/helpers');
const embeds = require('../utils/embeds');

/** guildId:userId -> joined timestamp */
const voiceJoin = new Map();

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function onJoin(guildId, userId) {
  voiceJoin.set(key(guildId, userId), Date.now());
}

function onLeave(guildId, userId) {
  voiceJoin.delete(key(guildId, userId));
}

/**
 * Otorga XP de voz a todos los miembros en VC (no AFK, no muted solo bots filter)
 */
async function tick(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!await db.isModuleEnabled(guild.id, 'leveling')) continue;
    const settings = await db.getGuildSettings(guild.id);

    for (const [, channel] of guild.channels.cache.filter((c) => c.isVoiceBased())) {
      if (channel.id === guild.afkChannelId) continue;
      for (const [, member] of channel.members) {
        if (member.user.bot) continue;
        if (member.voice.selfDeaf && member.voice.serverDeaf) continue;

        const user = await db.ensureUser(guild.id, member.id);
        const now = Date.now();
        if (now - (user.last_voice_xp || 0) < config.leveling.voiceIntervalMs) continue;

        const amount = config.leveling.voiceXpPerMinute || 5;
        const before = levelFromXp(user.xp_voice);
        const xp_voice = (user.xp_voice || 0) + amount;
        const after = levelFromXp(xp_voice);
        const minutes = (user.voice_minutes || 0) + 1;

        await db.updateUser(guild.id, member.id, {
          xp_voice,
          level_voice: after.level,
          last_voice_xp: now,
          voice_minutes: minutes,
        });

        if (after.level > before.level && settings.levelChannel) {
          const ch = guild.channels.cache.get(settings.levelChannel);
          if (ch) {
            ch.send({
              embeds: [
                embeds.god(
                  'Nivel de voz',
                  `🔊 ${member} subió a nivel de voz **${after.level}**`
                ),
              ],
            }).catch(() => {});
          }
        }
      }
    }
  }
}

function start(client) {
  setInterval(() => tick(client).catch(() => {}), config.leveling.voiceIntervalMs || 60_000);
}

module.exports = { onJoin, onLeave, tick, start };
