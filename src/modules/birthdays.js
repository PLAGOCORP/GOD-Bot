const cron = require('node-cron');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

function setBirthday(guildId, userId, day, month) {
  db.db
    .prepare(
      `INSERT INTO birthdays (user_id, guild_id, birth_day, birth_month)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, guild_id) DO UPDATE SET birth_day = excluded.birth_day, birth_month = excluded.birth_month`
    )
    .run(userId, guildId, day, month);
}

function getBirthday(guildId, userId) {
  return db.db
    .prepare('SELECT * FROM birthdays WHERE guild_id = ? AND user_id = ?')
    .get(guildId, userId);
}

function upcoming(guildId, limit = 10) {
  const now = new Date();
  const all = db.db.prepare('SELECT * FROM birthdays WHERE guild_id = ?').all(guildId);
  const scored = all.map((b) => {
    let next = new Date(now.getFullYear(), b.birth_month - 1, b.birth_day);
    if (next < now) next = new Date(now.getFullYear() + 1, b.birth_month - 1, b.birth_day);
    return { ...b, next, days: Math.ceil((next - now) / 86400000) };
  });
  return scored.sort((a, b) => a.days - b.days).slice(0, limit);
}

function parseDate(str) {
  const m = String(str).trim().match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { day, month };
}

async function runDaily(client) {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const yearKey = now.getFullYear() * 10000 + month * 100 + day;

  const rows = db.db
    .prepare('SELECT * FROM birthdays WHERE birth_day = ? AND birth_month = ?')
    .all(day, month);

  for (const row of rows) {
    if (row.last_wished === yearKey) continue;
    if (!db.isModuleEnabled(row.guild_id, 'birthdays')) continue;

    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) continue;
    const settings = db.getGuildSettings(row.guild_id);
    const channel = settings.birthdayChannel
      ? guild.channels.cache.get(settings.birthdayChannel)
      : null;

    if (channel) {
      await channel
        .send({
          content: `<@${row.user_id}>`,
          embeds: [
            embeds.god(
              '🎂 ¡Feliz cumpleaños!',
              `¡Hoy es el cumpleaños de <@${row.user_id}>!\n¡Que tengas un día divino! ⚡`
            ),
          ],
        })
        .catch(() => {});
    }

    if (settings.birthdayRole) {
      const member = await guild.members.fetch(row.user_id).catch(() => null);
      if (member) await member.roles.add(settings.birthdayRole).catch(() => {});
    }

    db.db
      .prepare('UPDATE birthdays SET last_wished = ? WHERE user_id = ? AND guild_id = ?')
      .run(yearKey, row.user_id, row.guild_id);
  }

  // Remove yesterday's birthday role
  for (const guild of client.guilds.cache.values()) {
    const settings = db.getGuildSettings(guild.id);
    if (!settings.birthdayRole) continue;
    const y = new Date(Date.now() - 86400000);
    const yDay = y.getDate();
    const yMonth = y.getMonth() + 1;
    const old = db.db
      .prepare('SELECT user_id FROM birthdays WHERE guild_id = ? AND birth_day = ? AND birth_month = ?')
      .all(guild.id, yDay, yMonth);
    for (const r of old) {
      const member = await guild.members.fetch(r.user_id).catch(() => null);
      if (member) await member.roles.remove(settings.birthdayRole).catch(() => {});
    }
  }
}

function startCron(client) {
  // Every day at 09:00 server time
  cron.schedule('0 9 * * *', () => {
    runDaily(client).catch((e) => logger.error('Birthdays cron:', e.message));
  });
  logger.info('Cron de cumpleaños programado (09:00 diario).');
}

module.exports = { setBirthday, getBirthday, upcoming, parseDate, runDaily, startCron };
