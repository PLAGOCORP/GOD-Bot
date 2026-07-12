const config = require('../config');
const logger = require('../utils/logger');

function handleRoleConnectionsVerification(client) {
  return async (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: 'Missing access_token' });
    }

    try {
      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!userRes.ok) {
        return res.status(401).json({ error: 'Invalid access_token' });
      }

      const user = await userRes.json();

      const db = require('../database/db');
      await db.ensureGuild(config.guildId || '0');
      const userData = await db.getUser(config.guildId || '0', user.id);
      const admin = require('firebase-admin');
      const fDb = admin.firestore();
      const warnsSnap = await fDb.collection('warns')
        .where('user_id', '==', user.id)
        .where('active', '==', true)
        .count()
        .get();

      const metadata = {
        level: String(userData?.level_text || 0),
        xp: String(userData?.xp_text || 0),
        coins: String(userData?.balance || 0),
        warnings: String(warnsSnap.data().count || 0),
      };

      res.json({
        account: {
          username: user.username,
          avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
        },
        metadata,
      });
    } catch (err) {
      logger.error('Role connections verify error:', err.message);
      res.status(500).json({ error: 'Internal error' });
    }
  };
}

module.exports = { handleRoleConnectionsVerification };
