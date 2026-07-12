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
    await db.markReminderFired(reminder.id);
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

async function loadPendingReminders(client) {
  try {
    const pending = await db.getPendingReminders();
    for (const r of pending) scheduleReminder(r, client);
    if (pending.length) require('../utils/logger').info(`⏰ ${pending.length} recordatorios pendientes cargados`);
  } catch { /* */ }
}

module.exports = { loadPendingReminders, scheduleReminder };
