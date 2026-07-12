/**
 * Música REAL vía @discordjs/voice + play-dl (YouTube/SoundCloud/URL directas)
 */
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  NoSubscriberBehavior,
} = require('@discordjs/voice');
const { PermissionFlagsBits } = require('discord.js');
const playdl = require('play-dl');
let ytdl = null;
try {
  ytdl = require('@distube/ytdl-core');
} catch (e) {
  // opcional, se usa como motor de respaldo si play-dl falla
}
const db = require('../database/db');
const logger = require('../utils/logger');
const config = require('../config');

// FFmpeg real (binario de ffmpeg-static)
try {
  const ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath) {
    process.env.FFMPEG_PATH = ffmpegPath;
    const { generateDependencyReport } = require('@discordjs/voice');
    logger.debug('FFmpeg:', ffmpegPath);
  }
} catch (e) {
  logger.warn('ffmpeg-static no disponible:', e.message);
}

// YouTube bloquea (HTTP 429) las peticiones de streaming desde IPs de
// datacenter si no van autenticadas. Si hay una cookie configurada
// (YOUTUBE_COOKIE), la usamos en ambos motores para reducir los bloqueos.
const youtubeCookie = config.music?.youtubeCookie || '';
let ytdlAgent = null;
if (youtubeCookie) {
  try {
    playdl.setToken({ youtube: { cookie: youtubeCookie } });
    logger.info('[MUSIC] Cookie de YouTube configurada en play-dl');
  } catch (e) {
    logger.warn('[MUSIC] No se pudo configurar cookie en play-dl:', e.message);
  }
  try {
    const cookies = youtubeCookie.split(';').map((pair) => {
      const idx = pair.indexOf('=');
      return { name: pair.slice(0, idx).trim(), value: pair.slice(idx + 1).trim() };
    }).filter((c) => c.name);
    ytdlAgent = ytdl?.createAgent ? ytdl.createAgent(cookies) : null;
    if (ytdlAgent) logger.info('[MUSIC] Cookie de YouTube configurada en ytdl-core');
  } catch (e) {
    logger.warn('[MUSIC] No se pudo configurar cookie en ytdl-core:', e.message);
  }
} else {
  logger.warn('[MUSIC] YOUTUBE_COOKIE no configurada — YouTube puede bloquear (429) el streaming en producción. Ver .env.example');
}

/** @type {Map<string, { player: import('@discordjs/voice').AudioPlayer, queue: Array, textChannelId: string|null, volume: number, loop: boolean }>} */
const guildPlayers = new Map();

function getState(guildId) {
  if (!guildPlayers.has(guildId)) {
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    const state = { player, queue: [], textChannelId: null, volume: 1, loop: false, current: null };
    player.on(AudioPlayerStatus.Idle, () => onIdle(guildId));
    player.on('error', (err) => logger.error('Music player:', err.message));
    guildPlayers.set(guildId, state);
  }
  return guildPlayers.get(guildId);
}

async function withTimeout(promise, ms, errorMsg) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(errorMsg)), ms)
  );
  return Promise.race([promise, timeout]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// YouTube devuelve 429 (Too Many Requests) cuando play-dl hace demasiadas
// peticiones seguidas. Reintenta con backoff exponencial antes de rendirse.
async function retryOn429(fn, { retries = 3, baseDelay = 1500, label = 'op' } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const is429 = /429|too many requests/i.test(err?.message || '');
      if (!is429 || attempt === retries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      logger.warn(`[MUSIC] 429 en ${label}, reintento ${attempt + 1}/${retries} en ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

async function resolveQuery(query) {
  try {
    // Direct URL
    if (/^https?:\/\//i.test(query)) {
      const type = await withTimeout(playdl.validate(query), 8000, 'Validación URL muy lenta');
      if (type === 'yt_video' || type === false) {
        const info = await withTimeout(
          retryOn429(() => playdl.video_info(query), { label: 'video_info', retries: 1, baseDelay: 1500 }),
          10000,
          'YouTube metadata timeout'
        ).catch(() => null);
        if (info?.video_details) {
          return {
            title: info.video_details.title,
            url: info.video_details.url,
            duration: info.video_details.durationInSec || 0,
            thumbnail: info.video_details.thumbnails?.[0]?.url,
          };
        }
      }
      if (type === 'so_track') {
        const info = await withTimeout(playdl.soundcloud(query), 15000, 'SoundCloud metadata timeout');
        return {
          title: info.name,
          url: info.url,
          duration: info.durationInSec || 0,
          thumbnail: info.thumbnail,
        };
      }
      // try as generic stream url
      return { title: query.slice(0, 80), url: query, duration: 0, thumbnail: null };
    }

    // YouTube search (20 seg timeout - play-dl puede ser lento)
    console.log(`[MUSIC] Searching: "${query}"`);
    const results = await withTimeout(
      retryOn429(() => playdl.search(query, { limit: 1, source: { youtube: 'video' } }), { label: 'search' }),
      20000,
      'Búsqueda YouTube timeout (>20s)'
    );
    console.log(`[MUSIC] Found: ${results?.length} results`);
    if (!results?.length) throw new Error('No se encontraron resultados para: ' + query);
    const v = results[0];
    return {
      title: v.title,
      url: v.url,
      duration: v.durationInSec || 0,
      thumbnail: v.thumbnails?.[0]?.url,
    };
  } catch (err) {
    logger.error('resolveQuery:', err.message);
    throw err;
  }
}

async function ensureConnection(member) {
  const channel = member.voice?.channel;
  if (!channel) throw new Error('Debes estar en un canal de voz.');
  const guild = channel.guild;
  const me = guild.members.me;

  // Chequeo de permisos explícito (channel.joinable a veces da falsos positivos)
  const perms = me ? channel.permissionsFor(me) : null;
  if (perms) {
    if (!perms.has(PermissionFlagsBits.ViewChannel)) {
      throw new Error('No puedo ver ese canal de voz (falta permiso Ver Canal).');
    }
    if (!perms.has(PermissionFlagsBits.Connect)) {
      throw new Error('No tengo permiso para **conectarme** a ese canal de voz.');
    }
    if (!perms.has(PermissionFlagsBits.Speak)) {
      throw new Error('No tengo permiso para **hablar** en ese canal de voz.');
    }
  }
  if (channel.userLimit && channel.members.size >= channel.userLimit && !perms?.has(PermissionFlagsBits.MoveMembers)) {
    throw new Error('El canal de voz está lleno.');
  }

  let connection = getVoiceConnection(guild.id);
  if (!connection || connection.joinConfig.channelId !== channel.id) {
    // Limpia cualquier conexión previa (posible "fantasma" de una sesión
    // anterior del bot que quedó registrada en Discord).
    const existing = getVoiceConnection(guild.id);
    if (existing) {
      existing.destroy();
      await sleep(500);
    }

    // Hasta 2 intentos: el "stuck en signalling" (VOICE_SERVER_UPDATE que
    // nunca llega) a menudo se resuelve con un reintento tras limpiar estado.
    const maxAttempts = 2;
    let lastGotServer = false;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let gotServer = false;
      let gotState = false;
      const rawProbe = (packet) => {
        if (packet?.t === 'VOICE_SERVER_UPDATE' && packet?.d?.guild_id === guild.id) {
          gotServer = true;
          logger.info(`[voice] ✓ VOICE_SERVER_UPDATE recibido (endpoint: ${packet.d.endpoint})`);
        }
        if (packet?.t === 'VOICE_STATE_UPDATE' && packet?.d?.guild_id === guild.id && packet?.d?.user_id === guild.client.user.id) {
          gotState = true;
          logger.info(`[voice] ✓ VOICE_STATE_UPDATE (bot) recibido (channel: ${packet.d.channel_id})`);
        }
      };
      guild.client.on('raw', rawProbe);

      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: true,
        debug: true,
      });

      connection.on('stateChange', (oldState, newState) => {
        logger.info(`[voice] (intento ${attempt}) estado ${oldState.status} -> ${newState.status}`);
      });
      connection.on('debug', (msg) => {
        logger.debug(`[voice:debug] ${String(msg).slice(0, 300)}`);
      });
      connection.on('error', (err) => {
        logger.error('[voice] Connection error:', err.message);
      });

      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
        guild.client.removeListener('raw', rawProbe);
        break; // ¡conectado!
      } catch (err) {
        lastGotServer = gotServer;
        logger.error(
          `[voice] intento ${attempt}/${maxAttempts} falló. Estado: ${connection.state.status}. ` +
          `VOICE_SERVER_UPDATE=${gotServer} VOICE_STATE_UPDATE=${gotState}. Error: ${err.message}`
        );
        guild.client.removeListener('raw', rawProbe);
        connection.destroy();
        connection = null;
        if (attempt < maxAttempts) {
          await sleep(1500);
          continue;
        }
      }
    }

    if (!connection) {
      if (!lastGotServer) {
        throw new Error(
          'Discord no envió los datos del servidor de voz. Suele ser un problema temporal ' +
          'de la región de voz — en el canal de voz: Editar canal → Región de voz → elige una fija ' +
          '(ej. US Central) o "Automático", y vuelve a intentarlo.'
        );
      }
      throw new Error(
        'No pude establecer la conexión de audio (el handshake **UDP** no completó). ' +
        'Esto ocurre cuando el servidor donde está alojado el bot no permite tráfico UDP ' +
        '(por ejemplo Railway). La música de Discord requiere UDP obligatoriamente. ' +
        'Solución: alojar el bot en un host que soporte UDP (un VPS o Fly.io).'
      );
    }
  }
  const state = getState(guild.id);
  connection.subscribe(state.player);
  return connection;
}

// Intenta primero play-dl y, si falla (típicamente por 429 de YouTube),
// cae a @distube/ytdl-core como motor alterno antes de rendirse.
async function getStreamForTrack(track) {
  try {
    return await withTimeout(
      retryOn429(
        () => playdl.stream(track.url, { discordPlayerCompatibility: true }),
        { label: 'play-dl stream', retries: 1, baseDelay: 1500 }
      ),
      15000,
      'play-dl stream timeout'
    );
  } catch (err1) {
    logger.warn(`[playNext] play-dl falló (${err1.message}), probando ytdl-core...`);

    if (!ytdl) throw err1;
    try {
      const isYoutube = /youtube\.com|youtu\.be/i.test(track.url);
      if (!isYoutube) throw err1;

      const nodeStream = ytdl(track.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        agent: ytdlAgent || undefined,
      });
      // Esperar a que empiece a fluir o falle, con timeout corto.
      await withTimeout(
        new Promise((resolve, reject) => {
          nodeStream.once('response', resolve);
          nodeStream.once('error', reject);
        }),
        15000,
        'ytdl-core stream timeout'
      );
      return { stream: nodeStream, type: 'arbitrary' };
    } catch (err2) {
      logger.error(`[playNext] ytdl-core también falló: ${err2.message}`);
      const blocked = /429|too many requests/i.test(err1.message) || /429|too many requests/i.test(err2.message);
      throw new Error(
        blocked
          ? 'YouTube está bloqueando las peticiones de este servidor (rate limit). Configura YOUTUBE_COOKIE o intenta más tarde.'
          : err1.message
      );
    }
  }
}

async function playNext(guildId) {
  const state = getState(guildId);
  if (!state.queue.length) {
    state.current = null;
    return null;
  }

  const track = state.queue.shift();
  state.current = track;

  try {
    let stream;
    try {
      logger.debug(`[playNext] Intentando stream: ${track.url}`);
      stream = await getStreamForTrack(track);
    } catch (err) {
      // Si falla el stream completamente, saltar
      logger.error(`[playNext] Stream error: ${err.message} - saltando a siguiente`);
      if (state.queue.length) {
        return playNext(guildId);
      }
      throw err;
    }

    if (!stream?.stream) {
      logger.error('[playNext] Stream vacío o inválido');
      if (state.queue.length) {
        return playNext(guildId);
      }
      throw new Error('No se pudo obtener el stream de audio');
    }

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });

    resource.on('error', (err) => {
      logger.error('[playNext] AudioResource error:', err.message);
    });

    if (resource.volume) resource.volume.setVolume(state.volume);
    state.player.play(resource);

    logger.info(`[playNext] Reproduciendo: ${track.title}`);

    try {
      await db.addMusicHistory(guildId, track.requestedBy || null, track.title, track.url);
    } catch (e) {
      logger.warn('[playNext] History log failed:', e.message);
    }

    return track;
  } catch (err) {
    logger.error('[playNext] Critical error:', err.message);
    state.current = null;
    // Try next track
    if (state.queue.length) {
      return playNext(guildId);
    }
    return null;
  }
}

async function onIdle(guildId) {
  const state = getState(guildId);
  if (state.loop && state.current) {
    state.queue.unshift(state.current);
  }
  await playNext(guildId);
}

async function play(member, query, textChannelId) {
  if (!await db.isModuleEnabled(member.guild.id, 'music')) {
    throw new Error('Módulo música desactivado.');
  }
  await ensureConnection(member);
  const trackMeta = await resolveQuery(query);
  const track = {
    ...trackMeta,
    requestedBy: member.id,
  };
  const state = getState(member.guild.id);
  state.textChannelId = textChannelId;
  state.queue.push(track);

  if (!state.current && state.player.state.status !== AudioPlayerStatus.Playing) {
    const playing = await playNext(member.guild.id);
    return { added: track, playing, position: 0 };
  }
  return { added: track, playing: state.current, position: state.queue.length };
}

function skip(guildId) {
  const state = getState(guildId);
  state.player.stop(true);
  return state.current;
}

function stop(guildId) {
  const state = getState(guildId);
  state.queue = [];
  state.loop = false;
  state.current = null;
  state.player.stop(true);
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
  guildPlayers.delete(guildId);
}

function pause(guildId) {
  getState(guildId).player.pause(true);
}

function resume(guildId) {
  getState(guildId).player.unpause();
}

function queue(guildId) {
  const s = getState(guildId);
  return { current: s.current, queue: [...s.queue], loop: s.loop };
}

function setLoop(guildId, on) {
  getState(guildId).loop = !!on;
  return getState(guildId).loop;
}

function setVolume(guildId, vol) {
  const s = getState(guildId);
  s.volume = Math.min(2, Math.max(0, vol));
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
