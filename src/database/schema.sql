-- G.O.D. Bot v3 Ultimate — Schema SQLite

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS guilds (
  guild_id TEXT PRIMARY KEY,
  language TEXT NOT NULL DEFAULT 'es',
  prefix TEXT NOT NULL DEFAULT 'g!',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS module_configs (
  guild_id TEXT NOT NULL,
  module TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (guild_id, module)
);

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  xp_text INTEGER NOT NULL DEFAULT 0,
  xp_voice INTEGER NOT NULL DEFAULT 0,
  level_text INTEGER NOT NULL DEFAULT 0,
  level_voice INTEGER NOT NULL DEFAULT 0,
  last_xp INTEGER NOT NULL DEFAULT 0,
  last_voice_xp INTEGER NOT NULL DEFAULT 0,
  warns_count INTEGER NOT NULL DEFAULT 0,
  messages_count INTEGER NOT NULL DEFAULT 0,
  invites_count INTEGER NOT NULL DEFAULT 0,
  inviter_id TEXT,
  joined_at INTEGER,
  balance INTEGER NOT NULL DEFAULT 200,
  bank INTEGER NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0,
  last_work INTEGER NOT NULL DEFAULT 0,
  inventory_json TEXT NOT NULL DEFAULT '{}',
  voice_minutes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS warns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  mod_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'Sin razón',
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  channel_id TEXT,
  thread_id TEXT,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  subject TEXT,
  priority TEXT DEFAULT 'normal',
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  closed_at INTEGER,
  last_activity INTEGER,
  transcript_path TEXT,
  rating INTEGER
);

CREATE TABLE IF NOT EXISTS giveaways (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  prize TEXT NOT NULL,
  winners_count INTEGER NOT NULL DEFAULT 1,
  end_timestamp INTEGER NOT NULL,
  requirements_json TEXT NOT NULL DEFAULT '{}',
  entrants_json TEXT NOT NULL DEFAULT '[]',
  ended INTEGER NOT NULL DEFAULT 0,
  host_id TEXT
);

CREATE TABLE IF NOT EXISTS reaction_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT,
  emoji TEXT NOT NULL,
  role_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'toggle',
  UNIQUE(message_id, emoji)
);

CREATE TABLE IF NOT EXISTS button_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT,
  custom_id TEXT NOT NULL UNIQUE,
  role_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'toggle',
  label TEXT
);

CREATE TABLE IF NOT EXISTS role_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  channel_id TEXT,
  name TEXT NOT NULL,
  options_json TEXT NOT NULL DEFAULT '[]',
  max_values INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  inviter_id TEXT,
  uses INTEGER NOT NULL DEFAULT 0,
  fake_detected INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (code, guild_id)
);

CREATE TABLE IF NOT EXISTS invite_joins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  inviter_id TEXT,
  code TEXT,
  joined_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  left_at INTEGER,
  is_fake INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS afk (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT 'AFK',
  since INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
  PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS tags (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT,
  uses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, name)
);

CREATE TABLE IF NOT EXISTS sticky_roles (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_ids_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS starboard (
  message_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  star_count INTEGER NOT NULL DEFAULT 0,
  starboard_message_id TEXT,
  author_id TEXT,
  PRIMARY KEY (message_id, guild_id)
);

CREATE TABLE IF NOT EXISTS birthdays (
  user_id TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  birth_day INTEGER NOT NULL,
  birth_month INTEGER NOT NULL,
  last_wished INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, guild_id)
);

CREATE TABLE IF NOT EXISTS temp_channels (
  channel_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  answers_json TEXT NOT NULL DEFAULT '{}',
  reviewed_by TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS application_types (
  guild_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  questions_json TEXT NOT NULL DEFAULT '[]',
  review_channel_id TEXT,
  approve_role_id TEXT,
  PRIMARY KEY (guild_id, type)
);

CREATE TABLE IF NOT EXISTS confessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by TEXT,
  published_message_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  user_id TEXT,
  query TEXT,
  response TEXT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS emote_packs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT,
  name TEXT NOT NULL,
  emoji_name TEXT NOT NULL,
  emoji_url TEXT NOT NULL,
  animated INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS embed_templates (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data_json TEXT NOT NULL,
  created_by TEXT,
  PRIMARY KEY (guild_id, name)
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  message_id TEXT,
  channel_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS antinuke_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS server_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  config_json TEXT NOT NULL,
  created_by TEXT,
  public INTEGER NOT NULL DEFAULT 0,
  builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS web_sessions (
  session_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS music_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT,
  url TEXT,
  played_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_users_guild_xp ON users(guild_id, xp_text DESC);
CREATE INDEX IF NOT EXISTS idx_warns_user ON warns(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_guild ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_giveaways_end ON giveaways(ended, end_timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_guild ON logs(guild_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_starboard ON starboard(guild_id, star_count DESC);
CREATE INDEX IF NOT EXISTS idx_birthdays ON birthdays(guild_id, birth_month, birth_day);
CREATE INDEX IF NOT EXISTS idx_confessions ON confessions(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_apps ON applications(guild_id, status);
