const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadEvents(client) {
  const eventsPath = path.join(__dirname, '..', 'events');
  if (!fs.existsSync(eventsPath)) return;
  let count = 0;
  for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
    try {
      const full = path.join(eventsPath, file);
      delete require.cache[require.resolve(full)];
      const event = require(full);
      if (!event?.name || typeof event.execute !== 'function') continue;
      if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
      else client.on(event.name, (...args) => event.execute(...args, client));
      count++;
    } catch (err) {
      logger.error(`Evento ${file}:`, err.message);
    }
  }
  logger.info(`${count} eventos cargados.`);
}

module.exports = { loadEvents };
