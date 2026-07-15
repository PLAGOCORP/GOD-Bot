const verification = require('../modules/verification');

async function publishVerificationPanel(client, guildId) {
  return verification.publishPanel(client, guildId);
}

module.exports = { publishVerificationPanel };