/**
 * Música vía Lavalink (shoukaku).
 *
 * El audio de Discord requiere UDP, que algunos hosts (Railway) no soportan.
 * Delegamos la conexión de voz a un servidor Lavalink alojado en un host con
 * UDP; el bot solo habla con Lavalink por WebSocket/TCP.
 *
 * Mantiene la misma API pública que el comando /musica espera:
 *   play, skip, stop, pause, resume, queue, setLoop, setVolume, getState, resolveQuery
 */
const { PermissionFlagsBits } = require('discord.js');
const lavalink = require('./lavalink');
const db = require('../database/db');
const logger = require('../utils/logger');

/**
 * Estado por guild.
 * @type {Map<string, { player: any, queue: Array, textChannelId: string|null, volume: number, loop: boolean, current: object|null, wired: boolean }>}
 */
const guildStates = new Map();

function getState(guildId) {
  if (!guildStates.has(guildId)) {
    guildStates.set(guildId, {
      player: null,
      queue: [],
      textChannelId: null,
      volume: 1,
      loop: false,
      current: null,
      wired: false,
    });
  }
  return guildStates.get(guildId);
}

// ─── Resolución de canciones vía Lavalink REST ────────────────────────

function trackFromLavalink(t) {
  return {
    encoded: t.encoded,
    title: t.info.title,
    url: t.info.uri || null,
    duration: t.info.length ? Math.round(t.info.length / 1000) : 0,
    thumbnail: t.info.artworkUrl || null,
    author: t.info.author || null,
    isStream: !!t.info.isStream,
  };
}

async function resolveQuery(query) {
  const node = lavalink.getNode();
  if (!node) {
    throw new Error('El servidor de música (Lavalink) no está conectado. Avisa a un administrador.');
  }

  const isUrl = /^https?:\/\//i.test(query);
  const identifier = isUrl ? query : `ytsearch:${query}`;

  const res = await node.rest.resolve(identifier);
  if (!res) throw new Error('No hubo respuesta del servidor de música.');

  switch (res.loadType) {
    case 'track':
      return trackFromLavalink(res.data);
    case 'search':
      if (!res.data.length) throw new Error('No se encontraron resultados para: ' + query);
      return trackFromLavalink(res.data[0]);
    case 'playlist':
      if (!res.data.tracks?.length) throw new Error('La playlist está vacía.');
      // Devolvemos el primer track pero marcamos la lista completa
      return { ...trackFromLavalink(res.data.tracks[0]), _playlist: res.data.tracks.map(trackFromLavalink) };
    case 'empty':
      throw new Error('No se encontraron resultados para: ' + query);
    case 'error':
      throw new Error(`Error del servidor de música: ${res.data?.message || 'desconocido'}`);
    default:
      throw new Error('Respuesta desconocida del servidor de música.');
  }
}

// ─── Conexión de voz (vía Lavalink) ───────────────────────────────────

async function ensureConnection(member, textChannelId) {
  const channel = member.voice?.channel;
  if (!channel) throw new Error('Debes estar en un canal de voz.');
  const guild = channel.guild;
  const me = guild.members.me;

  const perms = me ? channel.permissionsFor(me) : null;
  if (perms) {
    if (!perms.has(PermissionFlagsBits.ViewChannel)) throw new Error('No puedo ver ese canal de voz.');
    if (!perms.has(PermissionFlagsBits.Connect)) throw new Error('No tengo permiso para **conectarme** a ese canal de voz.');
    if (!perms.has(PermissionFlagsBits.Speak)) throw new Error('No tengo permiso para **hablar** en ese canal de voz.');
  }

  const manager = lavalink.getManager();
  if (!manager || !lavalink.getNode()) {
    throw new Error('El servidor de música (Lavalink) no está conectado. Avisa a un administrador.');
  }

  const state = getState(guild.id);
  state.textChannelId = textChannelId;

  // Reusar el player si ya está en el canal correcto
  let player = manager.players.get(guild.id);
  const currentChannelId = manager.connections.get(guild.id)?.channelId;
  if (player && currentChannelId && currentChannelId !== channel.id) {
    // Está en otro canal: salir para re-unirse en el correcto
    await manager.leaveVoiceChannel(guild.id).catch(() => {});
    player = null;
  }

  if (!player) {
    player = await manager.joinVoiceChannel({
      guildId: guild.id,
      channelId: channel.id,
      shardId: guild.shardId ?? 0,
      deaf: true,
    });
    state.wired = false;
  }

  state.player = player;
  wirePlayer(guild.id, state);
  return player;
}

function wirePlayer(guildId, state) {
  if (state.wired || !state.player) return;
  const player = state.player;

  player.on('end', (data) => {
    // reasons: finished, loadFailed, stopped, replaced, cleanup
    const reason = data?.reason;
    logger.debug(`[music] track end (${reason}) en ${guildId}`);
    if (reason === 'replaced' || reason === 'stopped' || reason === 'cleanup') return;
    onTrackEnd(guildId).catch((e) => logger.error('[music] onTrackEnd:', e.message));
  });

  player.on('exception', (data) => {
    logger.error(`[music] exception en ${guildId}: ${data?.exception?.message || 'desconocido'}`);
    onTrackEnd(guildId).catch(() => {});
  });

  player.on('stuck', () => {
    logger.warn(`[music] track stuck en ${guildId}, saltando`);
    onTrackEnd(guildId).catch(() => {});
  });

  player.on('closed', (data) => {
    logger.warn(`[music] conexión de voz cerrada en ${guildId} (code ${data?.code})`);
  });

  state.wired = true;
}

async function onTrackEnd(guildId) {
  const state = getState(guildId);
  if (state.loop && state.current) {
    state.queue.unshift(state.current);
  }
  await playNext(guildId);
}

async function playNext(guildId) {
  const state = getState(guildId);
  if (!state.player) {
    state.current = null;
    return null;
  }
  if (!state.queue.length) {
    state.current = null;
    // Nada más en cola: dejamos el player conectado (auto-desconexión opcional)
    return null;
  }

  const track = state.queue.shift();
  state.current = track;

  try {
    await state.player.playTrack({ track: { encoded: track.encoded } });
    await state.player.setGlobalVolume(Math.round((state.volume || 1) * 100));
    try {
      await db.addMusicHistory(guildId, track.requestedBy || null, track.title, track.url || '');
    } catch (e) {
      logger.warn('[music] addMusicHistory:', e.message);
    }
    return track;
  } catch (err) {
    logger.error('[music] playTrack falló:', err.message);
    state.current = null;
    if (state.queue.length) return playNext(guildId);
    return null;
  }
}

// ─── API pública ───────────────────────────────────────────────────────

async function play(member, query, textChannelId) {
  if (!await db.isModuleEnabled(member.guild.id, 'music')) {
    throw new Error('Módulo música desactivado.');
  }

  await ensureConnection(member, textChannelId);
  const meta = await resolveQuery(query);

  const state = getState(member.guild.id);

  // Playlist: encolar todo
  const tracks = meta._playlist ? meta._playlist : [meta];
  for (const t of tracks) {
    state.queue.push({ ...t, requestedBy: member.id });
  }
  const added = { ...meta, requestedBy: member.id };

  const isIdle = !state.current;
  if (isIdle) {
    const playing = await playNext(member.guild.id);
    return { added, playing, position: 0, playlistCount: meta._playlist ? tracks.length : 0 };
  }
  return { added, playing: state.current, position: state.queue.length, playlistCount: meta._playlist ? tracks.length : 0 };
}

async function skip(guildId) {
  const state = getState(guildId);
  const skipped = state.current;
  if (state.queue.length) {
    // playTrack reemplaza la actual (end('replaced') no auto-avanza)
    await playNext(guildId);
  } else if (state.player) {
    await state.player.stopTrack().catch(() => {});
    state.current = null;
  }
  return skipped;
}

async function stop(guildId) {
  const state = getState(guildId);
  state.queue = [];
  state.loop = false;
  state.current = null;
  const manager = lavalink.getManager();
  if (state.player) {
    await state.player.stopTrack().catch(() => {});
  }
  if (manager) {
    await manager.leaveVoiceChannel(guildId).catch(() => {});
  }
  guildStates.delete(guildId);
}

async function pause(guildId) {
  const state = getState(guildId);
  if (state.player) await state.player.setPaused(true).catch(() => {});
}

async function resume(guildId) {
  const state = getState(guildId);
  if (state.player) await state.player.setPaused(false).catch(() => {});
}

function queue(guildId) {
  const s = getState(guildId);
  return { current: s.current, queue: [...s.queue], loop: s.loop };
}

function setLoop(guildId, on) {
  const s = getState(guildId);
  s.loop = !!on;
  return s.loop;
}

async function setVolume(guildId, vol) {
  const s = getState(guildId);
  s.volume = Math.min(2, Math.max(0, vol));
  if (s.player) await s.player.setGlobalVolume(Math.round(s.volume * 100)).catch(() => {});
  return s.volume;
}

module.exports = {
  play,
  skip,
  stop,
  pause,
  resume,
  queue,
  setLoop,
  setVolume,
  getState,
  resolveQuery,
};
