const db = require('../database/db');
const config = require('../config');
const { randomInt } = require('../utils/helpers');

async function getEconomyConfig(guildId) {
  const settings = await db.getGuildSettings(guildId);
  const c = config.economy;
  return {
    symbol: c.symbol,
    currency: c.currency,
    dailyMin: settings.dailyMin ?? c.dailyMin,
    dailyMax: settings.dailyMax ?? c.dailyMax,
    workMin: settings.workMin ?? c.workMin,
    workMax: settings.workMax ?? c.workMax,
    dailyCooldown: settings.dailyCooldown ?? c.dailyCooldown,
    workCooldown: settings.workCooldown ?? c.workCooldown,
    startingBalance: settings.startingBalance ?? c.startingBalance,
  };
}

// Anti-doble-gasto: locks temporales por usuario (100ms)
const txLocks = new Map(); // "guildId:userId" => release timestamp

function acquireLock(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const locked = txLocks.get(key);
  if (locked && now < locked) return false; // aún bloqueado
  txLocks.set(key, now + 100); // liberar en 100ms
  return true;
}

function releaseLock(guildId, userId) {
  txLocks.delete(`${guildId}:${userId}`);
}

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
  if (!acquireLock(guildId, userId)) {
    return { ok: false, remaining: 1, locked: true };
  }
  try {
    const econ = await getEconomyConfig(guildId);
    const p = await getProfile(guildId, userId);
    const now = Date.now();
    if (now - (p.lastDaily || 0) < econ.dailyCooldown) {
      return { ok: false, remaining: econ.dailyCooldown - (now - p.lastDaily) };
    }
    const amount = randomInt(econ.dailyMin, econ.dailyMax);
    const balance = p.balance + amount;
    await saveMoney(guildId, userId, { balance, lastDaily: now });
    return { ok: true, amount, balance };
  } finally {
    releaseLock(guildId, userId);
  }
}

async function claimWork(guildId, userId) {
  if (!acquireLock(guildId, userId)) {
    return { ok: false, remaining: 1, locked: true };
  }
  try {
    const econ = await getEconomyConfig(guildId);
    const p = await getProfile(guildId, userId);
    const now = Date.now();
    if (now - (p.lastWork || 0) < econ.workCooldown) {
      return { ok: false, remaining: econ.workCooldown - (now - p.lastWork) };
    }
    const amount = randomInt(econ.workMin, econ.workMax);
    const balance = p.balance + amount;
    await saveMoney(guildId, userId, { balance, lastWork: now });
    return { ok: true, amount, balance };
  } finally {
    releaseLock(guildId, userId);
  }
}

async function transfer(guildId, fromId, toId, amount) {
  if (!acquireLock(guildId, fromId)) {
    return { ok: false, locked: true };
  }
  try {
    const from = await getProfile(guildId, fromId);
    if (from.balance < amount) return { ok: false };
    await db.ensureUser(guildId, toId);
    await saveMoney(guildId, fromId, { balance: from.balance - amount });
    const to = await getProfile(guildId, toId);
    await saveMoney(guildId, toId, { balance: to.balance + amount });
    return { ok: true };
  } finally {
    releaseLock(guildId, fromId);
  }
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

module.exports = { getProfile, saveMoney, claimDaily, claimWork, transfer, leaderboard, SHOP, getEconomyConfig };
