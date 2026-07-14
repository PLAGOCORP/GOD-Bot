/**
 * Web Dashboard + landing — https://botgod.pro
 * Express + Discord OAuth2 (producción con reverse proxy)
 */
const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../database/db');
const logger = require('../utils/logger');
const { handleInteractions } = require('./interactions');
const { handleRoleConnectionsVerification } = require('./roleConnections');

const expressLayouts = require('express-ejs-layouts');

function createDashboard(client) {
  const app = express();

  // Detrás de Nginx/Caddy/Cloudflare
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('layout', 'layout');
  app.use(expressLayouts);

  app.use(express.urlencoded({ extended: true }));

  // rawBody para verificar firmas de Discord Interactions
  app.use('/interactions', express.raw({ type: '*/*' }));
  app.use(express.json());
  app.use('/public', express.static(path.join(__dirname, 'public')));

  // CORS para landing en Firebase
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (origin.includes('botgod.pro') || origin.includes('web.app') || origin.includes('firebase'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

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

  // ─── Helpers EJS para el servidor (channelSelect / roleSelect) ──────────
  // Se generan por guild (ligados a sus canales/roles) y se pasan al render.
  const escapeHtml = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function makeSelectHelpers(channels, roles) {
    const build = (name, selected, list, prefix) => {
      const opts = (list || [])
        .map((item) => {
          const sel = item.id === selected ? ' selected' : '';
          return `<option value="${item.id}"${sel}>${prefix} ${escapeHtml(item.name)}</option>`;
        })
        .join('');
      return `<select name="${escapeHtml(name)}" class="bg-dark-800 border border-dark-700 rounded-lg px-3 py-2 w-full text-sm"><option value="">Ninguno</option>${opts}</select>`;
    };
    return {
      channelSelect: (name, selected) => build(name, selected, channels, '#'),
      roleSelect: (name, selected) => build(name, selected, roles, '@'),
    };
  }

  const sessionsDir = path.join(__dirname, '..', '..', 'data', 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  app.use(
    session({
      name: 'god.sid',
      secret: config.sessionSecret,
      store: new FileStore({
        path: sessionsDir,
        ttl: 7 * 24 * 60 * 60,
        retries: 1,
        logFn: () => {},
      }),
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

  async function refreshAccessToken(refreshToken) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const token = await tokenRes.json();
    return token.access_token ? { accessToken: token.access_token, expiresAt: Date.now() + (token.expires_in || 604800) * 1000 } : null;
  }

  function requireAuth(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    // Si el token expira en menos de 5 min, intentar refrescar
    if (req.session.refreshToken && req.session.expiresAt && Date.now() > req.session.expiresAt - 5 * 60_000) {
      refreshAccessToken(req.session.refreshToken)
        .then((renewed) => {
          if (renewed) {
            req.session.accessToken = renewed.accessToken;
            req.session.expiresAt = renewed.expiresAt;
          }
          next();
        })
        .catch(() => next());
    } else {
      next();
    }
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
      layout: false,
      bot: config.bot,
      site,
      user: null,
      inviteUrl: inviteUrl(),
      botStats: client
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
    res.render('features', { layout: false, bot: config.bot, site, user: req.session.user || null, inviteUrl: inviteUrl() });
  });

  app.get('/status', (req, res) => {
    res.render('status', {
      layout: false,
      bot: config.bot,
      site,
      user: req.session.user || null,
      botStats: client
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
      layout: false,
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
        <p class="mt-4">No vendemos datos. Los datos se almacenan de forma segura en Firebase Firestore.</p>
        <p class="mt-2">Contacto del operador: plago1806@gmail.com</p>
      `,
    });
  });

  app.get('/terms', (req, res) => {
    res.render('legal', {
      layout: false,
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
      return res.status(500).render('error', { layout: false,
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
      req.session.refreshToken = token.refresh_token;
      req.session.expiresAt = Date.now() + (token.expires_in || 604800) * 1000;
      res.redirect('/servers');
    } catch (err) {
      logger.error('OAuth botgod.pro:', err.message);
      res.status(500).render('error', { layout: false,
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
      layout: false,
      user: req.session.user,
      guilds: manageable,
      bot: config.bot,
      site,
      inviteUrl: inviteUrl(),
    });
  });

  app.get('/servers/:id', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);

    // Validar que el usuario sea admin del servidor
    if (!g) {
      return res.status(403).send('No tienes acceso a este servidor');
    }
    const perms = BigInt(g.permissions || 0);
    if ((perms & 0x8n) !== 0x8n) {
      return res.status(403).send('Necesitas permiso de Administrator');
    }

    // Redirigir al dashboard por defecto
    return res.redirect(`/servers/${guildId}/panel/dashboard`);
  });

  // Ruta antigua mantenida para compatibilidad (no usada en nuevo UI)
  app.get('/servers/:id/old', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g) return res.status(403).send('Sin acceso');
    const perms = BigInt(g.permissions || 0);
    if ((perms & 0x8n) !== 0x8n) return res.status(403).send('Necesitas Administrator');

    await db.ensureGuild(guildId);
    const settings = await db.getGuildSettings(guildId);
    const modEntries = Object.keys(db.DEFAULT_MODULES);
    const modules = await Promise.all(modEntries.map(async (m) => ({
      name: m,
      enabled: await db.isModuleEnabled(guildId, m),
    })));
    const [users, warns, tickets] = await Promise.all([
      db.countUsers(guildId),
      db.countActiveWarns(guildId),
      db.countOpenTickets(guildId),
    ]);
    const stats = { users, warns, tickets };
    const discordGuild = client?.guilds.cache.get(guildId);
    res.render('guild', {
      layout: false,
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

  app.post('/servers/:id/modules', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).send('Forbidden');
    if (req.body._modules) {
      const all = String(req.body._modules).split(',');
      for (const m of all) {
        await db.setModuleEnabled(guildId, m, req.body[`mod_${m}`] === 'on');
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

  app.post('/servers/:id/modules', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).send('Forbidden');
    try {
      const { _modules, ...rest } = req.body;
      const mods = {};
      if (_modules) {
        _modules.split(',').forEach((m) => {
          mods[m.trim()] = req.body['mod_' + m.trim()] === 'on';
        });
      }
      for (const [mod, enabled] of Object.entries(mods)) {
        await db.setModuleEnabled(guildId, mod, enabled);
      }
      res.redirect(`/servers/${guildId}?ok=modules`);
    } catch (err) {
      res.status(400).send('Error modules: ' + err.message);
    }
  });

  app.post('/servers/:id/settings', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).send('Forbidden');
    try {
      await db.setGuildSettings(guildId, req.body);
      res.redirect(`/servers/${guildId}?ok=settings`);
    } catch (err) {
      res.status(400).send('Error settings: ' + err.message);
    }
  });

  // ─── Panel helpers ──────────────────────────────────────────
  async function getGuildCtx(guildId) {
    await db.ensureGuild(guildId);
    const settings = await db.getGuildSettings(guildId);
    const modEntries = Object.keys(db.DEFAULT_MODULES);
    const modules = await Promise.all(modEntries.map(async (m) => ({
      name: m,
      enabled: await db.isModuleEnabled(guildId, m),
    })));
    const discordGuild = client?.guilds.cache.get(guildId);
    const channels = discordGuild
      ? discordGuild.channels.cache
          .filter((c) => [0, 2, 4, 5].includes(c.type))
          .sort((a, b) => a.rawPosition - b.rawPosition)
          .map((c) => ({ id: c.id, name: c.name, type: c.type }))
      : [];
    const roles = discordGuild
      ? discordGuild.roles.cache
          .filter((r) => r.id !== guildId)
          .sort((a, b) => b.rawPosition - a.rawPosition)
          .map((r) => ({ id: r.id, name: r.name }))
      : [];
    return { settings, modules, discordGuild, channels, roles };
  }

  async function getGuildStats(guildId) {
    try {
      const discordGuild = client?.guilds.cache.get(guildId);
      if (!discordGuild) {
        return {
          memberCount: 0,
          channelCount: 0,
          roleCount: 0,
          openTickets: 0,
          pendingConfessions: 0,
          topUsers: [],
        };
      }

      try {
        const admin = require('firebase-admin');
        const fDb = admin.firestore();

        // Top usuarios (nivel + economía)
        let topUsers = [];
        try {
          const usersSnap = await fDb.collection('users')
            .where('guild_id', '==', guildId)
            .orderBy('level_text', 'desc')
            .limit(5)
            .get();
          topUsers = usersSnap.docs.map(d => {
            const data = d.data();
            return {
              user_id: data.user_id,
              level: data.level_text || 0,
              balance: data.balance || 0,
              username: discordGuild.members.cache.get(data.user_id)?.user?.username || `Usuario ${data.user_id}`,
            };
          });
        } catch (e) {
          logger.warn('getGuildStats: topUsers error', e.message);
        }

        let openTickets = 0, pendingConfessions = 0;
        try {
          const ticketsSnap = await fDb.collection('tickets')
            .where('guild_id', '==', guildId)
            .where('status', 'in', ['open', 'claimed'])
            .get();
          openTickets = ticketsSnap.size;
        } catch (e) {
          logger.warn('getGuildStats: tickets error', e.message);
        }

        try {
          const confSnap = await fDb.collection('confessions')
            .where('guild_id', '==', guildId)
            .where('status', '==', 'pending')
            .get();
          pendingConfessions = confSnap.size;
        } catch (e) {
          logger.warn('getGuildStats: confessions error', e.message);
        }

        return {
          memberCount: discordGuild.memberCount || 0,
          channelCount: discordGuild.channels.cache.size,
          roleCount: discordGuild.roles.cache.size,
          openTickets,
          pendingConfessions,
          topUsers,
        };
      } catch (e) {
        logger.warn('getGuildStats: Firestore error', e.message);
        return {
          memberCount: discordGuild.memberCount || 0,
          channelCount: discordGuild.channels.cache.size,
          roleCount: discordGuild.roles.cache.size,
          openTickets: 0,
          pendingConfessions: 0,
          topUsers: [],
        };
      }
    } catch (e) {
      logger.error('getGuildStats critical error:', e.message);
      return {
        memberCount: 0,
        channelCount: 0,
        roleCount: 0,
        openTickets: 0,
        pendingConfessions: 0,
        topUsers: [],
      };
    }
  }

  const PANELS = ['dashboard', 'general', 'members', 'audit', 'channels', 'roles', 'welcome', 'moderation', 'logging', 'tickets', 'leveling', 'economy', 'giveaways', 'starboard', 'music', 'automod', 'security', 'birthdays', 'tempvc', 'stats', 'tags', 'confessions', 'suggestions', 'invites'];
  const PANEL_TITLES = { dashboard: '📊 Dashboard', general: 'General', members: '👥 Miembros', audit: '📋 Auditoría', channels: 'Canales', roles: 'Roles', welcome: 'Bienvenida', moderation: 'Moderación', logging: 'Logs', tickets: 'Tickets', leveling: 'Niveles', economy: 'Economía', giveaways: 'Sorteos', starboard: 'Starboard', music: 'Música', automod: 'AutoMod', security: 'Seguridad', birthdays: 'Cumpleaños', tempvc: 'Temp VC', stats: 'Estadísticas', tags: 'Tags', confessions: 'Confesiones', suggestions: 'Sugerencias', invites: 'Invitaciones' };

  for (const panel of PANELS) {
    app.get(`/servers/:id/panel/${panel}`, requireAuth, async (req, res) => {
      const guildId = req.params.id;
      const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
      if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).send('Necesitas Administrator');
      const ctx = await getGuildCtx(guildId);
      const { config: automodConfig } = await db.getModuleConfig(guildId, 'automod');
      let tags = [];
      try { tags = await db.listTags(guildId); } catch { /* */ }

      let stats = null;
      if (panel === 'dashboard') {
        try { stats = await getGuildStats(guildId); } catch { /* */ }
      }

      res.render(`panel/${panel}`, {
        layout: 'layout',
        title: PANEL_TITLES[panel] || panel,
        section: panel,
        guild: g,
        user: req.session.user,
        botVersion: config.bot.version,
        ...ctx,
        ...makeSelectHelpers(ctx.channels, ctx.roles),
        stats: stats || {},
        automodConfig,
        tags,
      });
    });
  }

  // ─── API REST ───────────────────────────────────────────────
  app.post('/api/guilds/:id/settings', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).json({ error: 'Forbidden' });
    try {
      await db.setGuildSettings(guildId, req.body);
      res.json({ ok: true, message: 'Configuración guardada' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/guilds/:id/modules', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { modules } = req.body;
      if (modules && typeof modules === 'object') {
        for (const [mod, enabled] of Object.entries(modules)) {
          await db.setModuleEnabled(guildId, mod, !!enabled);
        }
      }
      res.json({ ok: true, message: 'Módulos actualizados' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/guilds/:id/automod', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { enabled, ...cfg } = req.body;
      await db.setModuleConfig(guildId, 'automod', cfg);
      await db.setModuleEnabled(guildId, 'automod', !!enabled);
      res.json({ ok: true, message: 'AutoMod guardado' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/guilds/:id/tags', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    const g = (req.session.user.guilds || []).find((x) => x.id === guildId);
    if (!g || (BigInt(g.permissions || 0) & 0x8n) !== 0x8n) return res.status(403).json({ error: 'Forbidden' });
    try {
      const { action, name, content } = req.body;
      if (action === 'delete') {
        await db.deleteTag(guildId, name);
      } else if (action === 'add' && name && content) {
        await db.setTag(guildId, name, content, req.session.user.id);
      }
      res.json({ ok: true, message: 'Tag actualizado' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/guilds/:id/stats', requireAuth, async (req, res) => {
    const guildId = req.params.id;
    try {
      const [users, warns, tickets, tags, confessions, suggestions] = await Promise.all([
        db.countUsers(guildId),
        db.countActiveWarns(guildId),
        db.countOpenTickets(guildId),
        db.countTags(guildId),
        db.countPendingConfessions(guildId),
        db.countPendingSuggestions(guildId),
      ]);
      const stats = { users, warns, tickets, tags, confessions, suggestions };
      res.json({ ok: true, stats });
    } catch (e) {
      res.status(500).json({ error: e.message });
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
    res.status(404).render('error', { layout: false,
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
