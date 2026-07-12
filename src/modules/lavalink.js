/**
 * Gestión del cliente Lavalink (shoukaku).
 *
 * El bot se conecta por WebSocket/TCP a un servidor Lavalink que corre en un
 * host con soporte UDP. Lavalink es quien establece la conexión de voz UDP
 * con Discord — por eso la música funciona aunque el bot esté en Railway
 * (que no soporta UDP).
 */
const { Shoukaku, Connectors, Constants } = require('shoukaku');
const config = require('../config');
const logger = require('../utils/logger');

let manager = null;

function init(client) {
  if (!config.lavalink?.host) {
    logger.warn('[LAVALINK] No configurado (falta LAVALINK_HOST). El módulo de música estará deshabilitado.');
    return null;
  }

  const nodes = [
    {
      name: 'main',
      url: `${config.lavalink.host}:${config.lavalink.port}`,
      auth: config.lavalink.password,
      secure: config.lavalink.secure,
    },
  ];

  manager = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
    moveOnDisconnect: false,
    resume: true,
    resumeTimeout: 30,
    reconnectTries: 10,
    reconnectInterval: 5,
    restTimeout: 20000,
  });

  manager.on('ready', (name) => logger.info(`[LAVALINK] Nodo "${name}" conectado ✅`));
  manager.on('error', (name, err) => logger.error(`[LAVALINK] Error en nodo "${name}": ${err?.message || err}`));
  manager.on('close', (name, code) => logger.warn(`[LAVALINK] Nodo "${name}" cerrado (code ${code})`));
  manager.on('disconnect', (name, count) => logger.warn(`[LAVALINK] Nodo "${name}" desconectado (${count} players afectados)`));
  manager.on('reconnecting', (name, left) => logger.warn(`[LAVALINK] Reconectando "${name}" (intentos restantes: ${left})`));

  // shoukaku >=4 requiere que no explote si no hay listeners de 'error'
  manager.on('debug', () => {});

  logger.info(`[LAVALINK] Inicializado → ${config.lavalink.host}:${config.lavalink.port} (secure: ${config.lavalink.secure})`);
  return manager;
}

function getManager() {
  return manager;
}

function isReady() {
  if (!manager) return false;
  // Al menos un nodo en estado CONNECTED (State.CONNECTED === 1)
  for (const node of manager.nodes.values()) {
    if (node.state === Constants.State.CONNECTED) return true;
  }
  return false;
}

function getNode() {
  if (!manager) return null;
  return manager.getIdealNode() || null;
}

module.exports = { init, getManager, getNode, isReady };
