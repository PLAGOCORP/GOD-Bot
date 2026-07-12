const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const { parseDuration, formatDuration } = require('../utils/helpers');
const db = require('../database/db');

function scheduleReminder(reminder, client) {
  const delay = reminder.remind_at - Date.now();
  if (delay <= 0) {
    fireReminder(reminder, client);
    return;
  }
  setTimeout(() => fireReminder(reminder, client), Math.min(delay, 2147483647));
}

async function fireReminder(reminder, client) {
  try {
    db.db.prepare('UPDATE reminders SET fired = 1 WHERE id = ?').run(reminder.id);
  } catch { /* */ }
  try {
    const user = await client.users.fetch(reminder.user_id);
    await user.send({ embeds: [embeds.god('⏰ Recordatorio', reminder.content)] });
  } catch {
    if (reminder.channel_id) {
      const ch = await client.channels.fetch(reminder.channel_id).catch(() => null);
      if (ch) await ch.send({ content: `<@${reminder.user_id}> ⏰ **${reminder.content}**` }).catch(() => {});
    }
  }
}

function loadPendingReminders(client) {
  try {
    const pending = db.db.prepare('SELECT * FROM reminders WHERE fired = 0 AND remind_at > ?').all(Date.now());
    for (const r of pending) scheduleReminder(r, client);
    if (pending.length) require('../utils/logger').info(`⏰ ${pending.length} recordatorios pendientes cargados`);
  } catch { /* */ }
}

module.exports = { loadPendingReminders, scheduleReminder };
