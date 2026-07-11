const ms = require('ms');

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const formatNumber = (n) => Number(n || 0).toLocaleString('es-ES');

function progressBar(current, total, size = 10) {
  const pct = Math.min(1, Math.max(0, total ? current / total : 0));
  const filled = Math.round(size * pct);
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function xpForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function levelFromXp(xp) {
  let level = 0;
  let remaining = xp;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXp: remaining, needed: xpForLevel(level) };
}

function parseDuration(input) {
  if (!input) return null;
  const value = ms(String(input));
  return Number.isFinite(value) ? value : null;
}

function formatDuration(msValue) {
  if (!msValue || msValue < 0) return '0s';
  const s = Math.floor(msValue / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (sec || !parts.length) parts.push(`${sec}s`);
  return parts.join(' ');
}

function truncate(str, max = 1000) {
  if (!str) return '';
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

function formatTemplate(template, vars) {
  let out = String(template || '');
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v ?? ''));
  }
  return out;
}

module.exports = {
  randomInt,
  pick,
  formatNumber,
  progressBar,
  xpForLevel,
  levelFromXp,
  parseDuration,
  formatDuration,
  truncate,
  formatTemplate,
};
