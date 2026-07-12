const db = require('../database/db');
const config = require('../config');
const { randomInt } = require('../utils/helpers');

async function getProfile(guildId, userId) {
  const u = await db.ensureUser(guildId, userId);
  return {
    balance: u.balance,
    bank: u.bank,
    lastDaily: u.last_daily,
    lastWork: u.last_work,
    inventory: db.jparse(u.inventory_json, {}),
  };
}

async function saveMoney(guildId, userId, { balance, bank, lastDaily, lastWork, inventory }) {
  const fields = {};
  if (balance !== undefined) fields.balance = balance;
  if (bank !== undefined) fields.bank = bank;
  if (lastDaily !== undefined) fields.last_daily = lastDaily;
  if (lastWork !== undefined) fields.last_work = lastWork;
  if (inventory !== undefined) fields.inventory_json = db.jstr(inventory);
  return db.updateUser(guildId, userId, fields);
}

async function claimDaily(guildId, userId) {
  const p = await getProfile(guildId, userId);
  const now = Date.now();
  if (now - (p.lastDaily || 0) < config.economy.dailyCooldown) {
    return { ok: false, remaining: config.economy.dailyCooldown - (now - p.lastDaily) };
  }
  const amount = randomInt(config.economy.dailyMin, config.economy.dailyMax);
  const balance = p.balance + amount;
  saveMoney(guildId, userId, { balance, lastDaily: now });
  return { ok: true, amount, balance };
}

async function claimWork(guildId, userId) {
  const p = await getProfile(guildId, userId);
  const now = Date.now();
  if (now - (p.lastWork || 0) < config.economy.workCooldown) {
    return { ok: false, remaining: config.economy.workCooldown - (now - p.lastWork) };
  }
  const amount = randomInt(config.economy.workMin, config.economy.workMax);
  const balance = p.balance + amount;
  saveMoney(guildId, userId, { balance, lastWork: now });
  return { ok: true, amount, balance };
}

async function transfer(guildId, fromId, toId, amount) {
  const from = await getProfile(guildId, fromId);
  if (from.balance < amount) return { ok: false };
  await db.ensureUser(guildId, toId);
  await saveMoney(guildId, fromId, { balance: from.balance - amount });
  const to = await getProfile(guildId, toId);
  await saveMoney(guildId, toId, { balance: to.balance + amount });
  return { ok: true };
}

async function leaderboard(guildId, limit = 10) {
  const admin = require('firebase-admin');
  const fDb = admin.firestore();
  const snap = await fDb.collection('users')
    .where('guild_id', '==', guildId)
    .get();
  return snap.docs
    .map((d) => {
      const data = d.data();
      return {
        user_id: data.user_id,
        balance: data.balance || 0,
        bank: data.bank || 0,
        total: (data.balance || 0) + (data.bank || 0),
      };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

const SHOP = [
  { id: 'vip', name: 'Rol VIP (simbólico)', price: 5000, emoji: '👑' },
  { id: 'shield', name: 'Escudo anti-robo', price: 1500, emoji: '🛡️' },
  { id: 'lucky', name: 'Amuleto de la suerte', price: 2500, emoji: '🍀' },
  { id: 'crate', name: 'Caja misteriosa', price: 800, emoji: '📦' },
  { id: 'title_god', name: 'Título: Siervo de God', price: 10000, emoji: '⚡' },
];

module.exports = { getProfile, saveMoney, claimDaily, claimWork, transfer, leaderboard, SHOP };
