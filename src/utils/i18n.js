/**
 * i18n simple ES/EN (guild.language en DB)
 */
const strings = {
  es: {
    noPerms: 'Sin permisos',
    onlyAdmin: 'Solo administradores',
    moduleOff: 'Módulo desactivado',
    cooldown: 'Espera {s}s',
    error: 'Error',
    success: 'Listo',
  },
  en: {
    noPerms: 'Missing permissions',
    onlyAdmin: 'Admins only',
    moduleOff: 'Module disabled',
    cooldown: 'Wait {s}s',
    error: 'Error',
    success: 'Done',
  },
};

async function t(guildId, key, vars = {}) {
  let lang = 'es';
  try {
    const db = require('../database/db');
    const g = await db.getGuildSettings(guildId);
    if (g?.language) lang = g.language;
  } catch { /* */ }
  let s = strings[lang]?.[key] || strings.es[key] || key;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

module.exports = { t, strings };
