const crypto = require('crypto');
const config = require('../config');
const logger = require('../utils/logger');

const INTERACTION_TYPE = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  APPLICATION_COMMAND_AUTOCOMPLETE: 4,
  MODAL_SUBMIT: 5,
};

const INTERACTION_RESPONSE_TYPE = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE: 5,
  DEFERRED_UPDATE_MESSAGE: 6,
  UPDATE_MESSAGE: 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT: 8,
  POPUP_MODAL: 9,
};

function verifySignature(signature, timestamp, body, publicKey) {
  try {
    const message = Buffer.concat([
      Buffer.from(timestamp, 'utf8'),
      Buffer.from(body, 'utf8'),
    ]);
    const keyBuffer = Buffer.from(publicKey, 'hex');
    const sigBuffer = Buffer.from(signature, 'hex');

    return crypto.verify(null, message, { key: keyBuffer, format: 'der', type: 'spki', algorithm: { name: 'Ed25519' } }, sigBuffer);
  } catch {
    return false;
  }
}

function handleInteractions(client) {
  const publicKey = config.interactionsPublicKey;

  return async (req, res) => {
    const signature = req.headers['x-signature-ed25519'];
    const timestamp = req.headers['x-signature-timestamp'];
    const rawBody = req.rawBody;

    if (!publicKey) {
      return res.status(500).json({ error: 'PUBLIC_KEY not configured' });
    }

    if (!signature || !timestamp) {
      return res.status(401).json({ error: 'Missing signature' });
    }

    if (!verifySignature(signature, timestamp, rawBody, publicKey)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const interaction = req.body;

    if (interaction.type === INTERACTION_TYPE.PING) {
      return res.json({ type: INTERACTION_RESPONSE_TYPE.PONG });
    }

    if (interaction.type === INTERACTION_TYPE.APPLICATION_COMMAND) {
      const { name } = interaction.data;

      if (name === 'ping') {
        return res.json({
          type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: { content: `Pong! 🏓 ${Math.round(client.ws.ping)}ms` },
        });
      }

      if (name === 'help') {
        return res.json({
          type: INTERACTION_RESPONSE_TYPE.CHANNEL_MESSAGE_WITH_SOURCE,
          data: {
            content: '📋 **Comandos de God Bot**\nUsa `/` para ver todos los comandos disponibles.',
            flags: 64,
          },
        });
      }

      return res.json({
        type: INTERACTION_RESPONSE_TYPE.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Procesando...' },
      });
    }

    res.status(400).json({ error: 'Unknown interaction type' });
  };
}

module.exports = { handleInteractions };
