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
const playdl = require('play-dl');
const db = require('../database/db');
const logger = require('../utils/logger');

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

async function resolveQuery(query) {
  // Direct URL
  if (/^https?:\/\//i.test(query)) {
    const type = await playdl.validate(query);
    if (type === 'yt_video' || type === false) {
      const info = await playdl.video_info(query).catch(() => null);
      if (info?.video_details) {
        return {
          title: info.video_details.title,
          url: info.video_details.url,
          duration: info.video_details.durationInSec,
          thumbnail: info.video_details.thumbnails?.[0]?.url,
        };
      }
    }
    if (type === 'so_track') {
      const info = await playdl.soundcloud(query);
      return {
        title: info.name,
        url: info.url,
        duration: info.durationInSec,
        thumbnail: info.thumbnail,
      };
    }
    // try as generic stream url
    return { title: query.slice(0, 80), url: query, duration: 0, thumbnail: null };
  }

  // YouTube search
  const results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
  if (!results?.length) throw new Error('No se encontraron resultados.');
  const v = results[0];
  return {
    title: v.title,
    url: v.url,
    duration: v.durationInSec,
    thumbnail: v.thumbnails?.[0]?.url,
  };
}

async function ensureConnection(member) {
  const channel = member.voice?.channel;
  if (!channel) throw new Error('Debes estar en un canal de voz.');
  const me = channel.guild.members.me;
  if (!channel.joinable) throw new Error('No puedo unirme a ese canal de voz.');
  if (!channel.speakable && me) {
    // stage channels may differ
  }

  let connection = getVoiceConnection(channel.guild.id);
  if (!connection || connection.joinConfig.channelId !== channel.id) {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch {
      connection.destroy();
      throw new Error('No se pudo conectar al canal de voz a tiempo.');
    }
  }
  const state = getState(channel.guild.id);
  connection.subscribe(state.player);
  return connection;
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
    const yt = await playdl.validate(track.url);
    if (yt === 'yt_video' || track.url.includes('youtube') || track.url.includes('youtu.be')) {
      stream = await playdl.stream(track.url, { discordPlayerCompatibility: true });
    } else if (yt === 'so_track') {
      stream = await playdl.stream(track.url);
    } else {
      stream = await playdl.stream(track.url).catch(async () => {
        // fallback search by title
        const r = await resolveQuery(track.title);
        return playdl.stream(r.url, { discordPlayerCompatibility: true });
      });
    }

    const resource = createAudioResource(stream.stream, {
      inputType: stream.type,
      inlineVolume: true,
    });
    if (resource.volume) resource.volume.setVolume(state.volume);
    state.player.play(resource);

    db.db
      .prepare('INSERT INTO music_history (guild_id, user_id, title, url) VALUES (?, ?, ?, ?)')
      .run(guildId, track.requestedBy || null, track.title, track.url);

    return track;
  } catch (err) {
    logger.error('playNext:', err.message);
    // try next
    return playNext(guildId);
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
  if (!db.isModuleEnabled(member.guild.id, 'music')) {
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
