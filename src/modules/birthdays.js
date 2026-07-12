const cron = require('node-cron');
const admin = require('firebase-admin');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

async function setBirthday(guildId, userId, day, month) {
  await db.setBirthday(guildId, userId, day, month);
}

async function getBirthday(guildId, userId) {
  const snap = await admin.firestore().collection('birthdays').doc(`${guildId}_${userId}`).get();
  return snap.exists ? snap.data() : null;
}

async function upcoming(guildId, limit = 10) {
  const now = new Date();
  const all = await db.getBirthdays(guildId);
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

  const rows = await db.getTodayBirthdays();

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

    await admin.firestore().collection('birthdays').doc(`${row.guild_id}_${row.user_id}`).set({ last_wished: yearKey }, { merge: true });
  }

  // Remove yesterday's birthday role
  for (const guild of client.guilds.cache.values()) {
    const settings = db.getGuildSettings(guild.id);
    if (!settings.birthdayRole) continue;
    const y = new Date(Date.now() - 86400000);
    const yDay = y.getDate();
    const yMonth = y.getMonth() + 1;
    const oldSnap = await admin.firestore().collection('birthdays')
      .where('guild_id', '==', guild.id).where('birth_day', '==', yDay).where('birth_month', '==', yMonth).get();
    const old = oldSnap.docs.map((d) => d.data());
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
