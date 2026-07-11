const config = require('../config');

const levels = { debug: 0, info: 1, warn: 2, error: 3 };
const current = levels[process.env.LOG_LEVEL || 'info'] ?? 1;

function log(level, ...args) {
  if ((levels[level] ?? 1) < current) return;
  const ts = new Date().toISOString().slice(11, 19);
  const prefix = { debug: '🔍', info: '⚡', warn: '⚠️', error: '❌' }[level] || '•';
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${ts}] ${prefix} [GOD]`, ...args);
}

module.exports = {
  debug: (...a) => log('debug', ...a),
  info: (...a) => log('info', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
  botName: config.bot.name,
};
