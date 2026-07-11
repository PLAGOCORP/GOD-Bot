require('dotenv').config();

const parseIds = (raw) =>
  (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';
const defaultDashboardUrl = isProd ? 'https://botgod.pro' : 'http://localhost:3847';

module.exports = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  prefix: process.env.PREFIX || 'g!',
  ownerIds: parseIds(process.env.OWNER_IDS),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,

  domain: process.env.DOMAIN || 'botgod.pro',
  siteName: process.env.SITE_NAME || 'BotGod',

  xai: {
    apiKey: process.env.XAI_API_KEY || '',
    model: process.env.XAI_MODEL || 'grok-4.5',
    baseURL: 'https://api.x.ai/v1',
  },

  colors: {
    primary: 0x9b59b6,
    success: 0x2ecc71,
    error: 0xe74c3c,
    warning: 0xf39c12,
    info: 0x3498db,
    god: 0xffd700,
    mod: 0xe67e22,
    logDelete: 0xe74c3c,
    logEdit: 0xf1c40f,
    logJoin: 0x2ecc71,
    logLeave: 0x95a5a6,
  },

  bot: {
    name: 'God',
    fullName: 'God Bot — botgod.pro',
    version: '3.1.0',
    description:
      'El bot Discord todo-en-uno. Moderación, tickets, niveles, música, IA y dashboard web en botgod.pro',
  },

  // OAuth2 / Web Dashboard — producción: https://botgod.pro
  clientSecret: process.env.CLIENT_SECRET || '',
  interactionsPublicKey: process.env.INTERACTIONS_PUBLIC_KEY || '',
  dashboardPort: parseInt(process.env.DASHBOARD_PORT || '3847', 10),
  dashboardUrl: (process.env.DASHBOARD_URL || defaultDashboardUrl).replace(/\/$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'god-bot-change-me-in-production',
  cookieSecure:
    process.env.COOKIE_SECURE === '1' ||
    process.env.COOKIE_SECURE === 'true' ||
    (isProd && String(process.env.DASHBOARD_URL || defaultDashboardUrl).startsWith('https')),

  economy: {
    symbol: '⚡',
    currency: 'God Coins',
    dailyMin: 100,
    dailyMax: 500,
    workMin: 50,
    workMax: 250,
    dailyCooldown: 86_400_000,
    workCooldown: 3_600_000,
    startingBalance: 200,
  },

  leveling: {
    xpMin: 15,
    xpMax: 25,
    cooldown: 60_000,
    voiceXpPerMinute: 5,
    voiceIntervalMs: 60_000,
  },

  automod: {
    maxMentions: 5,
    maxEmojis: 15,
    spamWindowMs: 5000,
    spamMaxMessages: 5,
  },

  giveaways: {
    checkIntervalMs: 15_000,
  },

  tickets: {
    inactiveHours: 48,
  },
};
