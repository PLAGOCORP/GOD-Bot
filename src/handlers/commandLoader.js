const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadCommands(client) {
  const commandsPath = path.join(__dirname, '..', 'commands');
  client.commands = new Map();
  client.commandArray = [];

  if (!fs.existsSync(commandsPath)) return;

  for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
    try {
      const full = path.join(commandsPath, file);
      delete require.cache[require.resolve(full)];
      const command = require(full);
      if (!command?.data?.name || typeof command.execute !== 'function') {
        logger.warn(`Comando incompleto: ${file}`);
        continue;
      }
      client.commands.set(command.data.name, command);
      client.commandArray.push(command.data.toJSON());
    } catch (err) {
      logger.error(`Error cargando ${file}:`, err.message);
    }
  }
  logger.info(`${client.commands.size} comandos slash cargados.`);
}

module.exports = { loadCommands };
