const db = require('../database/db');
const invites = require('../modules/invites');

async function getInviteDashboard(client, guildId, { limit = 15 } = {}) {
  const board = await invites.topInvites(guildId, limit);
  const leaderboard = await Promise.all(
    board.map(async (e) => {
      let name = e.user_id;
      let avatar = null;
      if (client) {
        const u = await client.users.fetch(e.user_id).catch(() => null);
        if (u) {
          name = u.globalName || u.username;
          avatar = u.displayAvatarURL({ size: 64 });
        }
      }
      const fakes = await invites.fakeCount(guildId, e.user_id);
      return {
        userId: e.user_id,
        name,
        avatar,
        invites: e.invites_count,
        fakes,
      };
    })
  );

  const { config } = await db.getModuleConfig(guildId, 'invites');
  const rewards = config.rewards || {};

  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const totalSnap = await fDb.collection('users')
    .where('guild_id', '==', guildId)
    .where('invites_count', '>', 0)
    .count()
    .get();
  const totalInviters = totalSnap.data().count || 0;

  return { leaderboard, rewards, totalInviters };
}

async function setInviteRewards(guildId, rewards) {
  const clean = {};
  if (rewards && typeof rewards === 'object') {
    for (const [need, roleId] of Object.entries(rewards)) {
      const n = parseInt(need, 10);
      if (n > 0 && roleId) clean[String(n)] = String(roleId);
    }
  }
  await db.setModuleConfig(guildId, 'invites', { rewards: clean });
  return clean;
}

module.exports = { getInviteDashboard, setInviteRewards };