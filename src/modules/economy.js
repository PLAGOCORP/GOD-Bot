const db = require('../database/db');
const config = require('../config');
const { randomInt } = require('../utils/helpers');

function getProfile(guildId, userId) {
  const u = db.ensureUser(guildId, userId);
  return {
    balance: u.balance,
    bank: u.bank,
    lastDaily: u.last_daily,
    lastWork: u.last_work,
    inventory: db.jparse(u.inventory_json, {}),
  };
}

function saveMoney(guildId, userId, { balance, bank, lastDaily, lastWork, inventory }) {
  const fields = {};
  if (balance !== undefined) fields.balance = balance;
  if (bank !== undefined) fields.bank = bank;
  if (lastDaily !== undefined) fields.last_daily = lastDaily;
  if (lastWork !== undefined) fields.last_work = lastWork;
  if (inventory !== undefined) fields.inventory_json = db.jstr(inventory);
  return db.updateUser(guildId, userId, fields);
}

function claimDaily(guildId, userId) {
  const p = getProfile(guildId, userId);
  const now = Date.now();
  if (now - (p.lastDaily || 0) < config.economy.dailyCooldown) {
    return { ok: false, remaining: config.economy.dailyCooldown - (now - p.lastDaily) };
  }
  const amount = randomInt(config.economy.dailyMin, config.economy.dailyMax);
  const balance = p.balance + amount;
  saveMoney(guildId, userId, { balance, lastDaily: now });
  return { ok: true, amount, balance };
}

function claimWork(guildId, userId) {
  const p = getProfile(guildId, userId);
  const now = Date.now();
  if (now - (p.lastWork || 0) < config.economy.workCooldown) {
    return { ok: false, remaining: config.economy.workCooldown - (now - p.lastWork) };
  }
  const amount = randomInt(config.economy.workMin, config.economy.workMax);
  const balance = p.balance + amount;
  saveMoney(guildId, userId, { balance, lastWork: now });
  return { ok: true, amount, balance };
}

function transfer(guildId, fromId, toId, amount) {
  const from = getProfile(guildId, fromId);
  if (from.balance < amount) return { ok: false };
  db.ensureUser(guildId, toId);
  saveMoney(guildId, fromId, { balance: from.balance - amount });
  const to = getProfile(guildId, toId);
  saveMoney(guildId, toId, { balance: to.balance + amount });
  return { ok: true };
}

function leaderboard(guildId, limit = 10) {
  return db.db
    .prepare(
      'SELECT user_id, balance, bank, (balance + bank) AS total FROM users WHERE guild_id = ? ORDER BY total DESC LIMIT ?'
    )
    .all(guildId, limit);
}

const SHOP = [
  { id: 'vip', name: 'Rol VIP (simbólico)', price: 5000, emoji: '👑' },
  { id: 'shield', name: 'Escudo anti-robo', price: 1500, emoji: '🛡️' },
  { id: 'lucky', name: 'Amuleto de la suerte', price: 2500, emoji: '🍀' },
  { id: 'crate', name: 'Caja misteriosa', price: 800, emoji: '📦' },
  { id: 'title_god', name: 'Título: Siervo de God', price: 10000, emoji: '⚡' },
];

module.exports = { getProfile, saveMoney, claimDaily, claimWork, transfer, leaderboard, SHOP };
