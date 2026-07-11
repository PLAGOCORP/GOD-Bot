/**
 * Web Dashboard + landing — https://botgod.pro
 * Express + Discord OAuth2 (producción con reverse proxy)
 */
const express = require('express');
const session = require('express-session');
const path = require('path');
const config = require('../config');
const db = require('../database/db');
const logger = require('../utils/logger');
const { handleInteractions } = require('./interactions');
const { handleRoleConnectionsVerification } = require('./roleConnections');

function createDashboard(client) {
  const app = express();

  // Detrás de Nginx/Caddy/Cloudflare
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.urlencoded({ extended: true }));

  // rawBody para verificar firmas de Discord Interactions
  app.use('/interactions', express.raw({ type: '*/*' }));
  app.use(express.json());
  app.use('/public', express.static(path.join(__dirname, 'public')));

  // Seguridad básica de headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-DNS-Prefetch-Control', 'on');
    if (config.cookieSecure) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(
    session({
      name: 'god.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: config.cookieSecure,
        sameSite: 'lax',
      },
    })
  );

  const redirectUri = `${config.dashboardUrl}/auth/callback`;
  const site = {
    domain: config.domain,
    url: config.dashboardUrl,
    name: config.siteName,
  };

  function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    next();
  }

  function inviteUrl() {
    if (!config.clientId) return '#';
    const perms = '8'; // Administrator (puedes bajarlo después)
    return (
      `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}` +
      `&permissions=${perms}&scope=bot%20applications.commands`
    );
  }

  // ─── Landing pública ───────────────────────────────────────
  app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/servers');
    res.render('home', {
      bot: config.bot,
      site,
      user: null,
      inviteUrl: inviteUrl(),
      client: client
        ? {
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
            ping: Math.round(client.ws.ping),
            ready: true,
          }
        : { guilds: 0, users: 0, ping: 0, ready: false },
    });
  });

  app.get('/features', (req, res) => {
    res.render('features', { bot: config.bot, site, user: req.session.user || null, inviteUrl: inviteUrl() });
  });

  app.get('/status', (req, res) => {
    res.render('status', {
      bot: config.bot,
      site,
      user: req.session.user || null,
      client: client
        ? {
            guilds: client.guilds.cache.size,
            users: client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0),
            ping: Math.round(client.ws.ping),
            uptime: client.uptime,
            ready: true,
            version: config.bot.version,
          }
        : null,
    });
  });

  app.get('/privacy', (req, res) => {
    res.render('legal', {
      bot: config.bot,
      site,
      title: 'Privacidad',
      body: `
        <p><strong>botgod.pro</strong> (God Bot) almacena datos necesarios para el funcionamiento del bot:</p>
        <ul class="list-disc pl-6 space-y-2 mt-4 text-slate-300">
          <li>IDs de Discord (usuarios, servidores, canales, roles)</li>
          <li>Configuración del servidor, warns, tickets, XP, economía</li>
          <li>Transcripts de tickets si usas ese módulo</li>
          <li>Sesión web vía OAuth2 de Discord (solo si inicias sesión en el dashboard)</li>
        </ul>
        <p class="mt-4">No vendemos datos. El bot es self-hosted: los datos viven en la base SQLite del operador.</p>
        <p class="mt-2">Contacto del operador: el dueño del bot que hostea la instancia.</p>
      `,
    });
  });

  app.get('/terms', (req, res) => {
    res.render('legal', {
      bot: config.bot,
      site,
      title: 'Términos',
      body: `
        <p>Al invitar a <strong>God Bot</strong> o usar <strong>botgod.pro</strong> aceptas:</p>
        <ul class="list-disc pl-6 space-y-2 mt-4 text-slate-300">
          <li>Respetar los <a class="text-amber-400 underline" href="https://discord.com/terms" target="_blank">Términos de Discord</a>.</li>
          <li>No usar el bot para abuso, spam, raids o contenido ilegal.</li>
          <li>Que el operador puede restringir el acceso por mal uso.</li>
          <li>El servicio se ofrece “tal cual”; el uptime depende de la infraestructura del host.</li>
        </ul>
      `,
    });
  });

  // ─── Auth OAuth2 ───────────────────────────────────────────
  app.get('/login', (req, res) => {
    if (!config.clientId || !config.clientSecret) {
      return res.status(500).render('error', {
        bot: config.bot,
        site,
        message:
          'Falta CLIENT_ID o CLIENT_SECRET. Configura OAuth2 en Discord Developer Portal con redirect: ' +
          redirectUri,
      });
    }
    const url =
      `https://discord.com/api/oauth2/authorize?client_id=${config.clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code&scope=identify%20guilds`;
    res.redirect(url);
  });

  app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.redirect('/login');
    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: redirectUri,
      });
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      const token = await tokenRes.json();
      if (!token.access_token) throw new Error(JSON.stringify(token));

      const userRes = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const user = await userRes.json();

      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const guilds = await guildsRes.json();

      req.session.user = {
        id: user.id,
        username: user.username,
        global_name: user.global_name,
        avatar: user.avatar,
        guilds: Array.isArray(guilds) ? guilds : [],
      };
      req.session.accessToken = token.access_token;
      res.redirect('/servers');
    } catch (err) {
      logger.error('OAuth botgod.pro:', err.message);
      res.status(500).render('error', {
        bot: config.bot,
        site,
        message: 'Error OAuth: ' + err.message + '. Verifica el Redirect URI: ' + redirectUri,
      });
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
  });

  // ─── Dashboard ─────────────────────────────────────────────
  app.get('/servers', requireAuth, (req, res) => {
    const botGuildIds = client
      ? new Set(client.guilds.cache.map((g) => g.id))
      : new Set();
    const manageable = (req.session.user.guilds || []).filter((g) => {
      const perms = BigInt(g.permissions || 0);
      const isAdmin = (perms & 0x8n) === 0x8n;
      return isAdmin && botGuildIds.has(g.id);
    });
    res.render('servers', {
      user: req.session.user,
      guilds: manageable,
      bot: config.bot,
      site,
    });
  });

  app.get('/servers/:id', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g) return res.status(403).send('Sin acceso');
    const perms = BigInt(g.permissions || 0);
    if ((perms & 0x8n) !== 0x8n) return res.status(403).send('Necesitas Administrator');

    db.ensureGuild(guildId);
    const settings = db.getGuildSettings(guildId);
    const modules = Object.keys(db.DEFAULT_MODULES).map((m) => ({
      name: m,
      enabled: db.isModuleEnabled(guildId, m),
    }));
    const stats = {
      users: db.db.prepare('SELECT COUNT(*) AS c FROM users WHERE guild_id = ?').get(guildId).c,
      warns: db.db.prepare('SELECT COUNT(*) AS c FROM warns WHERE guild_id = ? AND active = 1').get(guildId).c,
      tickets: db.db
        .prepare("SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status != 'closed'")
        .get(guildId).c,
    };
    const discordGuild = client?.guilds.cache.get(guildId);
    res.render('guild', {
      user: req.session.user,
      guild: g,
      discordGuild,
      settings,
      modules,
      stats,
      bot: config.bot,
      site,
    });
  });

  app.post('/servers/:id/modules', requireAuth, (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).send('Forbidden');
    if (req.body._modules) {
      const all = String(req.body._modules).split(',');
      for (const m of all) {
        db.setModuleEnabled(guildId, m, req.body[`mod_${m}`] === 'on');
      }
    }
    res.redirect(`/servers/${guildId}`);
  });

  app.post('/servers/:id/roles', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).send('Forbidden');
    const guild = client?.guilds.cache.get(guildId);
    if (!guild) return res.status(400).send('Bot no está en el servidor');
    const { userId, roleId, action } = req.body;
    try {
      const member = await guild.members.fetch(userId);
      if (action === 'add') await member.roles.add(roleId);
      else await member.roles.remove(roleId);
      res.redirect(`/servers/${guildId}?ok=role`);
    } catch (err) {
      res.status(400).send('Error roles: ' + err.message);
    }
  });

  // ─── Discord Interactions Endpoint ─────────────────────────
  app.post('/interactions', (req, res, next) => {
    req.rawBody = req.body.toString('utf8');
    try { req.body = JSON.parse(req.rawBody); } catch { /* */ }
    next();
  }, handleInteractions(client));

  // ─── Role Connections Verification ────────────────────────
  app.post('/role-connections/verify', handleRoleConnectionsVerification(client));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      domain: config.domain,
      version: config.bot.version,
      ready: Boolean(client?.isReady?.() ?? client?.ws?.status === 0),
      guilds: client?.guilds?.cache?.size || 0,
    });
  });

  app.get('/api/stats', (_req, res) => {
    res.json({
      guilds: client?.guilds?.cache?.size || 0,
      users: client
        ? client.guilds.cache.reduce((a, g) => a + (g.memberCount || 0), 0)
        : 0,
      ping: client ? Math.round(client.ws.ping) : null,
      version: config.bot.version,
    });
  });

  // 404
  app.use((req, res) => {
    res.status(404).render('error', {
      bot: config.bot,
      site,
      message: 'Página no encontrada.',
    });
  });

  return app;
}

function startDashboard(client) {
  if (process.env.DASHBOARD_DISABLED === '1') {
    logger.info('Dashboard desactivado (DASHBOARD_DISABLED=1)');
    return null;
  }
  const app = createDashboard(client);
  const port = config.dashboardPort;
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Web en ${config.dashboardUrl} → puerto local ${port}`);
    logger.info(`OAuth redirect: ${config.dashboardUrl}/auth/callback`);
  });
  return server;
}

if (require.main === module) {
  require('dotenv').config();
  startDashboard(null);
}

module.exports = { createDashboard, startDashboard };
