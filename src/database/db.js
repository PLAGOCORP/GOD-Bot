const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'god.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schema);

// ─── helpers JSON ───────────────────────────────────────────
const jparse = (s, fb = {}) => {
  try {
    return s ? JSON.parse(s) : structuredClone(fb);
  } catch {
    return structuredClone(fb);
  }
};
const jstr = (o) => JSON.stringify(o ?? {});

// ─── GUILDS ─────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  welcomeChannel: null,
  leaveChannel: null,
  welcomeMessage: '¡Bienvenido {user} a **{server}**! Eres el miembro #{count}.',
  leaveMessage: '**{user}** ha abandonado **{server}**.',
  welcomeDm: false,
  logChannels: {
    mod: null,
    message: null,
    member: null,
    server: null,
    ticket: null,
  },
  levelChannel: null,
  ticketCategory: null,
  ticketLog: null,
  verificationChannel: null,
  verifiedRole: null,
  unverifiedRole: null,
  modRole: null,
  staffRoles: [],
  muteRole: null,
  statsChannels: { members: null, online: null, boosts: null },
  starboardChannel: null,
  starboardEmoji: '⭐',
  starboardMin: 3,
  confessionChannel: null,
  confessionReviewChannel: null,
  suggestionChannel: null,
  birthdayChannel: null,
  birthdayRole: null,
  tempvcCategory: null,
  tempvcPanelChannel: null,
  tempvcLimit: 3,
  musicDjRole: null,
  antinukeThreshold: 3,
  antinukeWindowMs: 10000,
  antiraidThreshold: 8,
  antiraidWindowMs: 15000,
  antiraidLockMinutes: 10,
  antiraidKick: false,
  minAccountAgeHours: 0,
  kickNewAccounts: false,
  stickyRoleIds: [],
  verifyQuiz: null,
  dashboardEnabled: true,
};

const DEFAULT_MODULES = {
  moderation: true,
  automod: true,
  tickets: true,
  leveling: true,
  giveaways: true,
  reaction_roles: true,
  welcome: true,
  logging: true,
  invites: true,
  emotes: true,
  economy: true,
  music: true,
  tags: true,
  antiraid: true,
  fun: true,
  starboard: true,
  birthdays: true,
  tempvc: true,
  applications: true,
  confessions: true,
  antinuke: true,
  ai: true,
  stats: true,
  suggestions: true,
};

// Migraciones ligeras (columnas nuevas)
try {
  db.exec(`ALTER TABLE users ADD COLUMN last_voice_xp INTEGER NOT NULL DEFAULT 0`);
} catch { /* already exists */ }
try {
  db.exec(`ALTER TABLE users ADD COLUMN voice_minutes INTEGER NOT NULL DEFAULT 0`);
} catch { /* */ }
try {
  db.exec(`ALTER TABLE tickets ADD COLUMN last_activity INTEGER`);
} catch { /* */ }
try {
  db.exec(`ALTER TABLE tickets ADD COLUMN priority TEXT DEFAULT 'normal'`);
} catch { /* */ }
try {
  db.exec(`ALTER TABLE tickets ADD COLUMN rating INTEGER`);
} catch { /* */ }

function ensureGuild(guildId) {
  const row = db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
  if (row) return row;
  db.prepare('INSERT INTO guilds (guild_id) VALUES (?)').run(guildId);
  for (const [mod, en] of Object.entries(DEFAULT_MODULES)) {
    db.prepare(
      'INSERT OR IGNORE INTO module_configs (guild_id, module, enabled, config_json) VALUES (?, ?, ?, ?)'
    ).run(guildId, mod, en ? 1 : 0, '{}');
  }
  return db.prepare('SELECT * FROM guilds WHERE guild_id = ?').get(guildId);
}

function getGuildSettings(guildId) {
  ensureGuild(guildId);
  const row = db.prepare('SELECT settings_json FROM guilds WHERE guild_id = ?').get(guildId);
  return { ...DEFAULT_SETTINGS, ...jparse(row?.settings_json, {}), logChannels: {
    ...DEFAULT_SETTINGS.logChannels,
    ...(jparse(row?.settings_json, {}).logChannels || {}),
  }};
}

function setGuildSettings(guildId, patch) {
  ensureGuild(guildId);
  const cur = getGuildSettings(guildId);
  const next = {
    ...cur,
    ...patch,
    logChannels: { ...cur.logChannels, ...(patch.logChannels || {}) },
  };
  db.prepare('UPDATE guilds SET settings_json = ? WHERE guild_id = ?').run(jstr(next), guildId);
  return next;
}

function isModuleEnabled(guildId, module) {
  ensureGuild(guildId);
  const row = db
    .prepare('SELECT enabled FROM module_configs WHERE guild_id = ? AND module = ?')
    .get(guildId, module);
  if (!row) return DEFAULT_MODULES[module] !== false;
  return !!row.enabled;
}

function setModuleEnabled(guildId, module, enabled) {
  ensureGuild(guildId);
  db.prepare(
    `INSERT INTO module_configs (guild_id, module, enabled, config_json)
     VALUES (?, ?, ?, '{}')
     ON CONFLICT(guild_id, module) DO UPDATE SET enabled = excluded.enabled`
  ).run(guildId, module, enabled ? 1 : 0);
}

function getModuleConfig(guildId, module) {
  ensureGuild(guildId);
  const row = db
    .prepare('SELECT config_json, enabled FROM module_configs WHERE guild_id = ? AND module = ?')
    .get(guildId, module);
  return {
    enabled: row ? !!row.enabled : DEFAULT_MODULES[module] !== false,
    config: jparse(row?.config_json, {}),
  };
}

function setModuleConfig(guildId, module, configPatch, enabled) {
  ensureGuild(guildId);
  const cur = getModuleConfig(guildId, module);
  const config = { ...cur.config, ...configPatch };
  const en = enabled === undefined ? (cur.enabled ? 1 : 0) : enabled ? 1 : 0;
  db.prepare(
    `INSERT INTO module_configs (guild_id, module, enabled, config_json)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, module) DO UPDATE SET
       enabled = excluded.enabled,
       config_json = excluded.config_json`
  ).run(guildId, module, en, jstr(config));
  return { enabled: !!en, config };
}

// ─── USERS ──────────────────────────────────────────────────
function ensureUser(guildId, userId) {
  let row = db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
  if (row) return row;
  db.prepare(
    'INSERT INTO users (user_id, guild_id, joined_at) VALUES (?, ?, ?)'
  ).run(userId, guildId, Date.now());
  return db.prepare('SELECT * FROM users WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
}

function updateUser(guildId, userId, fields) {
  ensureUser(guildId, userId);
  const keys = Object.keys(fields);
  if (!keys.length) return ensureUser(guildId, userId);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${sets} WHERE user_id = ? AND guild_id = ?`).run(
    ...keys.map((k) => fields[k]),
    userId,
    guildId
  );
  return ensureUser(guildId, userId);
}

// ─── WARNS ──────────────────────────────────────────────────
function addWarn(guildId, userId, modId, reason) {
  const info = db
    .prepare('INSERT INTO warns (user_id, guild_id, mod_id, reason) VALUES (?, ?, ?, ?)')
    .run(userId, guildId, modId, reason || 'Sin razón');
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM warns WHERE guild_id = ? AND user_id = ? AND active = 1')
    .get(guildId, userId).c;
  updateUser(guildId, userId, { warns_count: count });
  return { id: info.lastInsertRowid, total: count };
}

function listWarns(guildId, userId) {
  return db
    .prepare(
      'SELECT * FROM warns WHERE guild_id = ? AND user_id = ? AND active = 1 ORDER BY timestamp DESC'
    )
    .all(guildId, userId);
}

function clearWarns(guildId, userId) {
  db.prepare('UPDATE warns SET active = 0 WHERE guild_id = ? AND user_id = ?').run(guildId, userId);
  updateUser(guildId, userId, { warns_count: 0 });
}

function removeWarn(guildId, warnId) {
  const row = db.prepare('SELECT * FROM warns WHERE id = ? AND guild_id = ?').get(warnId, guildId);
  if (!row) return null;
  db.prepare('UPDATE warns SET active = 0 WHERE id = ?').run(warnId);
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM warns WHERE guild_id = ? AND user_id = ? AND active = 1')
    .get(guildId, row.user_id).c;
  updateUser(guildId, row.user_id, { warns_count: count });
  return row;
}

// ─── LOGS DB ────────────────────────────────────────────────
function insertLog(guildId, type, { userId, targetId, details } = {}) {
  db.prepare(
    'INSERT INTO logs (guild_id, type, user_id, target_id, details_json) VALUES (?, ?, ?, ?, ?)'
  ).run(guildId, type, userId || null, targetId || null, jstr(details || {}));
}

function recentLogs(guildId, limit = 20, type = null) {
  if (type) {
    return db
      .prepare('SELECT * FROM logs WHERE guild_id = ? AND type = ? ORDER BY timestamp DESC LIMIT ?')
      .all(guildId, type, limit);
  }
  return db
    .prepare('SELECT * FROM logs WHERE guild_id = ? ORDER BY timestamp DESC LIMIT ?')
    .all(guildId, limit);
}

// ─── GIVEAWAYS ──────────────────────────────────────────────
function saveGiveaway(g) {
  db.prepare(
    `INSERT OR REPLACE INTO giveaways
     (id, guild_id, channel_id, message_id, prize, winners_count, end_timestamp, requirements_json, entrants_json, ended, host_id)
     VALUES (@id, @guild_id, @channel_id, @message_id, @prize, @winners_count, @end_timestamp, @requirements_json, @entrants_json, @ended, @host_id)`
  ).run({
    ...g,
    requirements_json: typeof g.requirements_json === 'string' ? g.requirements_json : jstr(g.requirements_json || {}),
    entrants_json: typeof g.entrants_json === 'string' ? g.entrants_json : jstr(g.entrants_json || []),
    ended: g.ended ? 1 : 0,
  });
}

function getGiveaway(id) {
  const row = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    requirements: jparse(row.requirements_json, {}),
    entrants: jparse(row.entrants_json, []),
    ended: !!row.ended,
  };
}

function activeGiveaways() {
  return db
    .prepare('SELECT * FROM giveaways WHERE ended = 0')
    .all()
    .map((row) => ({
      ...row,
      requirements: jparse(row.requirements_json, {}),
      entrants: jparse(row.entrants_json, []),
      ended: false,
    }));
}

// ─── TICKETS ────────────────────────────────────────────────
function createTicket(data) {
  const info = db
    .prepare(
      `INSERT INTO tickets (guild_id, creator_id, channel_id, thread_id, category, subject, status)
       VALUES (@guild_id, @creator_id, @channel_id, @thread_id, @category, @subject, 'open')`
    )
    .run(data);
  return info.lastInsertRowid;
}

function getTicketByChannel(channelId) {
  return db
    .prepare("SELECT * FROM tickets WHERE (channel_id = ? OR thread_id = ?) AND status != 'closed' ORDER BY id DESC LIMIT 1")
    .get(channelId, channelId);
}

function updateTicket(id, fields) {
  const keys = Object.keys(fields);
  const sets = keys.map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE tickets SET ${sets} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
}

// ─── REACTION ROLES ─────────────────────────────────────────
function addReactionRole({ guildId, messageId, channelId, emoji, roleId, mode }) {
  db.prepare(
    `INSERT OR REPLACE INTO reaction_roles (guild_id, message_id, channel_id, emoji, role_id, mode)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(guildId, messageId, channelId || null, emoji, roleId, mode || 'toggle');
}

function getReactionRoles(messageId) {
  return db.prepare('SELECT * FROM reaction_roles WHERE message_id = ?').all(messageId);
}

function addButtonRole({ guildId, messageId, channelId, customId, roleId, mode, label }) {
  db.prepare(
    `INSERT OR REPLACE INTO button_roles (guild_id, message_id, channel_id, custom_id, role_id, mode, label)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(guildId, messageId, channelId || null, customId, roleId, mode || 'toggle', label || null);
}

function getButtonRole(customId) {
  return db.prepare('SELECT * FROM button_roles WHERE custom_id = ?').get(customId);
}

// ─── INVITES ────────────────────────────────────────────────
function upsertInvite(code, guildId, inviterId, uses) {
  db.prepare(
    `INSERT INTO invites (code, guild_id, inviter_id, uses) VALUES (?, ?, ?, ?)
     ON CONFLICT(code, guild_id) DO UPDATE SET inviter_id = excluded.inviter_id, uses = excluded.uses`
  ).run(code, guildId, inviterId, uses);
}

function getInvites(guildId) {
  return db.prepare('SELECT * FROM invites WHERE guild_id = ?').all(guildId);
}

function recordJoin({ guildId, userId, inviterId, code }) {
  db.prepare(
    'INSERT INTO invite_joins (guild_id, user_id, inviter_id, code) VALUES (?, ?, ?, ?)'
  ).run(guildId, userId, inviterId || null, code || null);
  if (inviterId) {
    ensureUser(guildId, inviterId);
    db.prepare(
      'UPDATE users SET invites_count = invites_count + 1 WHERE user_id = ? AND guild_id = ?'
    ).run(inviterId, guildId);
  }
}

// ─── AFK / TAGS ─────────────────────────────────────────────
function setAfk(guildId, userId, reason) {
  db.prepare(
    `INSERT INTO afk (user_id, guild_id, reason, since) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, guild_id) DO UPDATE SET reason = excluded.reason, since = excluded.since`
  ).run(userId, guildId, reason || 'AFK', Date.now());
}

function getAfk(guildId, userId) {
  return db.prepare('SELECT * FROM afk WHERE user_id = ? AND guild_id = ?').get(userId, guildId);
}

function clearAfk(guildId, userId) {
  db.prepare('DELETE FROM afk WHERE user_id = ? AND guild_id = ?').run(userId, guildId);
}

function getTag(guildId, name) {
  return db.prepare('SELECT * FROM tags WHERE guild_id = ? AND name = ?').get(guildId, name.toLowerCase());
}

function setTag(guildId, name, content, createdBy) {
  db.prepare(
    `INSERT INTO tags (guild_id, name, content, created_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, name) DO UPDATE SET content = excluded.content`
  ).run(guildId, name.toLowerCase(), content, createdBy);
}

function deleteTag(guildId, name) {
  return db.prepare('DELETE FROM tags WHERE guild_id = ? AND name = ?').run(guildId, name.toLowerCase());
}

function listTags(guildId) {
  return db.prepare('SELECT name, uses FROM tags WHERE guild_id = ? ORDER BY name').all(guildId);
}

module.exports = {
  db,
  jparse,
  jstr,
  DEFAULT_SETTINGS,
  DEFAULT_MODULES,
  ensureGuild,
  getGuildSettings,
  setGuildSettings,
  isModuleEnabled,
  setModuleEnabled,
  getModuleConfig,
  setModuleConfig,
  ensureUser,
  updateUser,
  addWarn,
  listWarns,
  clearWarns,
  removeWarn,
  insertLog,
  recentLogs,
  saveGiveaway,
  getGiveaway,
  activeGiveaways,
  createTicket,
  getTicketByChannel,
  updateTicket,
  addReactionRole,
  getReactionRoles,
  addButtonRole,
  getButtonRole,
  upsertInvite,
  getInvites,
  recordJoin,
  setAfk,
  getAfk,
  clearAfk,
  getTag,
  setTag,
  deleteTag,
  listTags,
};
