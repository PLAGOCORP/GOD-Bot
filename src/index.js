/**
 *  ██████╗  ██████╗ ██████╗
 * ██╔════╝ ██╔═══██╗██╔══██╗
 * ██║  ███╗██║   ██║██║  ██║
 * ██║   ██║██║   ██║██║  ██║
 * ╚██████╔╝╚██████╔╝██████╔╝
 * G.O.D. v3 Ultimate — implementación real completa
 */
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const { loadCommands } = require('./handlers/commandLoader');
const { loadEvents } = require('./handlers/eventLoader');
const { startDashboard } = require('./dashboard/server');
const birthdays = require('./modules/birthdays');
const voiceXp = require('./modules/voiceXp');
const statsChannels = require('./modules/statsChannels');
const tempvc = require('./modules/tempvc');
const templates = require('./modules/templates');
const tickets = require('./modules/tickets');
const giveaways = require('./modules/giveaways');
const { loadPendingReminders } = require('./modules/reminders');
const db = require('./database/db');

if (!config.token) {
  logger.error('Falta DISCORD_TOKEN en .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
    Partials.GuildMember,
  ],
});

client.commands = new Collection();
client.cooldowns = new Collection();
client.config = config;

loadCommands(client);
loadEvents(client);

// Seed plantillas built-in en DB
try {
  templates.seedBuiltinToDb();
} catch (e) {
  logger.warn('Seed templates:', e.message);
}

// Auto-close tickets inactivos (cada hora)
setInterval(async () => {
  try {
    const hours = config.tickets.inactiveHours || 48;
    const cutoff = Date.now() - hours * 3600_000;
    const stale = db.db
      .prepare(
        `SELECT * FROM tickets WHERE status IN ('open','claimed') AND (last_activity IS NULL OR last_activity < ?) AND created_at < ?`
      )
      .all(cutoff, cutoff);
    for (const t of stale) {
      if (!t.channel_id) continue;
      const ch = await client.channels.fetch(t.channel_id).catch(() => null);
      if (ch) {
        await ch
          .send({ embeds: [require('./utils/embeds').warning('Auto-cierre', `Ticket inactivo ${hours}h. Cerrando...`)] })
          .catch(() => {});
        setTimeout(() => ch.delete().catch(() => {}), 8000);
      }
      db.updateTicket(t.id, { status: 'closed', closed_at: Date.now() });
    }
  } catch { /* */ }
}, 60 * 60_000);

// Temp VC cleanup periódico
setInterval(() => tempvc.cleanupEmpty(client), 60_000);

client.once(require('discord.js').Events.ClientReady, () => {
  birthdays.startCron(client);
  voiceXp.start(client);
  statsChannels.start(client);
  giveaways.startChecker(client);
  loadPendingReminders(client);
  startDashboard(client);

  // Firebase: stats públicas para la landing (Firestore public/stats)
  try {
    const fb = require('./firebase/admin');
    if (fb.init()) {
      const publish = () => {
        fb.publishPublicStats({
          guilds: client.guilds.cache.size,
          users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
          ping: Math.round(client.ws.ping),
          version: require('./config').bot.version,
        }).catch(() => {});
      };
      publish();
      setInterval(publish, 5 * 60_000);
    }
  } catch {
    /* firebase-admin no instalado o sin credenciales */
  }
});

process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));

client.login(config.token).catch((err) => {
  logger.error('Login fallido:', err.message);
  process.exit(1);
});
