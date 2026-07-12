const db = require('../database/db');
const logger = require('../utils/logger');

async function updateGuild(guild) {
  if (!await db.isModuleEnabled(guild.id, 'stats')) return;
  const settings = await db.getGuildSettings(guild.id);
  const sc = settings.statsChannels || {};
  if (!sc.members && !sc.online && !sc.boosts) return;

  try {
    await guild.members.fetch().catch(() => {});
  } catch { /* */ }

  const total = guild.memberCount;
  const online = guild.members.cache.filter(
    (m) => m.presence && m.presence.status !== 'offline'
  ).size;
  const boosts = guild.premiumSubscriptionCount || 0;

  const renames = [
    [sc.members, `📊 Miembros: ${total}`],
    [sc.online, `🟢 Online: ${online || '—'}`],
    [sc.boosts, `💎 Boosts: ${boosts}`],
  ];

  for (const [id, name] of renames) {
    if (!id) continue;
    const ch = guild.channels.cache.get(id);
    if (ch && ch.name !== name) {
      await ch.setName(name).catch(() => {});
    }
  }
}

function start(client) {
  const run = async () => {
    for (const guild of client.guilds.cache.values()) {
      await updateGuild(guild).catch((e) => logger.debug('stats:', e.message));
    }
  };
  setTimeout(run, 15_000);
  setInterval(run, 10 * 60_000); // cada 10 min (rate limits de Discord)
}

module.exports = { updateGuild, start };
