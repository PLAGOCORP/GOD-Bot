require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('./config');
const { loadCommands } = require('./handlers/commandLoader');

const client = { commands: new Map(), commandArray: [] };
loadCommands(client);

if (!config.token || !config.clientId) {
  console.error('Faltan DISCORD_TOKEN o CLIENT_ID en .env');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(config.token);
const isGlobal = process.argv.includes('--global');

(async () => {
  try {
    console.log(`Registrando ${client.commandArray.length} comandos (${isGlobal ? 'GLOBAL' : 'GUILD'})...`);
    let data;
    if (isGlobal) {
      data = await rest.put(Routes.applicationCommands(config.clientId), { body: client.commandArray });
    } else {
      if (!config.guildId) {
        console.error('Falta GUILD_ID (o usa --global)');
        process.exit(1);
      }
      data = await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: client.commandArray,
      });
    }
    console.log(`✅ ${data.length} comandos registrados.`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
