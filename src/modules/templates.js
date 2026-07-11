/**
 * Plantillas de servidor REALES: crean canales, roles y config en Discord
 */
const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');

const BUILTIN = {
  gaming: {
    name: 'Gaming Community',
    description: 'Servidor de juegos: categorías, roles VIP/Mod, tickets, leveling, starboard',
    roles: [
      { name: 'Admin', color: 0xe74c3c, perms: [PermissionFlagsBits.Administrator] },
      { name: 'Mod', color: 0xe67e22, perms: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.KickMembers] },
      { name: 'VIP', color: 0xf1c40f, perms: [] },
      { name: 'Booster', color: 0xe91e63, perms: [] },
      { name: 'Miembro', color: 0x3498db, perms: [] },
    ],
    categories: [
      {
        name: '📢 INFORMACIÓN',
        channels: [
          { name: 'bienvenida', type: ChannelType.GuildText },
          { name: 'reglas', type: ChannelType.GuildText },
          { name: 'anuncios', type: ChannelType.GuildText },
        ],
      },
      {
        name: '💬 GENERAL',
        channels: [
          { name: 'chat', type: ChannelType.GuildText },
          { name: 'memes', type: ChannelType.GuildText },
          { name: 'starboard', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🎮 JUEGOS',
        channels: [
          { name: 'looking-for-group', type: ChannelType.GuildText },
          { name: 'clips', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🔊 VOZ',
        channels: [
          { name: 'Lobby', type: ChannelType.GuildVoice },
          { name: 'Gaming 1', type: ChannelType.GuildVoice },
          { name: 'Gaming 2', type: ChannelType.GuildVoice },
        ],
      },
      {
        name: '🎫 SOPORTE',
        channels: [
          { name: 'tickets', type: ChannelType.GuildText },
          { name: 'staff-logs', type: ChannelType.GuildText },
        ],
      },
    ],
    modules: { leveling: true, tickets: true, starboard: true, welcome: true, giveaways: true },
  },
  support: {
    name: 'Support / Helpdesk',
    description: 'Soporte profesional con tickets y roles de staff',
    roles: [
      { name: 'Admin', color: 0xe74c3c, perms: [PermissionFlagsBits.Administrator] },
      { name: 'Support', color: 0x2ecc71, perms: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ModerateMembers] },
      { name: 'Cliente', color: 0x3498db, perms: [] },
    ],
    categories: [
      {
        name: '📌 INFO',
        channels: [
          { name: 'bienvenida', type: ChannelType.GuildText },
          { name: 'faq', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🎫 TICKETS',
        channels: [
          { name: 'abrir-ticket', type: ChannelType.GuildText },
          { name: 'ticket-logs', type: ChannelType.GuildText },
        ],
      },
      {
        name: '👥 STAFF',
        channels: [
          { name: 'staff-chat', type: ChannelType.GuildText },
          { name: 'mod-logs', type: ChannelType.GuildText },
        ],
      },
    ],
    modules: { tickets: true, logging: true, automod: true, ai: true },
  },
  comunidad: {
    name: 'Comunidad / Activismo',
    description: 'Propuestas, denuncias anónimas, roles de zona',
    roles: [
      { name: 'Coordinación', color: 0x9b59b6, perms: [PermissionFlagsBits.Administrator] },
      { name: 'Moderación', color: 0xe67e22, perms: [PermissionFlagsBits.ModerateMembers, PermissionFlagsBits.ManageMessages] },
      { name: 'Vecino', color: 0x1abc9c, perms: [] },
    ],
    categories: [
      {
        name: '📣 COMUNIDAD',
        channels: [
          { name: 'bienvenida', type: ChannelType.GuildText },
          { name: 'propuestas', type: ChannelType.GuildText },
          { name: 'confesiones', type: ChannelType.GuildText },
          { name: 'general', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🗳️ VOTACIONES',
        channels: [{ name: 'encuestas', type: ChannelType.GuildText }],
      },
    ],
    modules: { confessions: true, suggestions: true, welcome: true, leveling: true },
  },
  educacion: {
    name: 'Educación / Estudio',
    description: 'Canales por materia, roles profe/alumno, XP',
    roles: [
      { name: 'Profesor', color: 0xe74c3c, perms: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageChannels] },
      { name: 'Alumno', color: 0x3498db, perms: [] },
      { name: 'Tutor', color: 0xf39c12, perms: [] },
    ],
    categories: [
      {
        name: '📚 AULA',
        channels: [
          { name: 'anuncios', type: ChannelType.GuildText },
          { name: 'dudas', type: ChannelType.GuildText },
          { name: 'recursos', type: ChannelType.GuildText },
        ],
      },
      {
        name: '📖 MATERIAS',
        channels: [
          { name: 'matematicas', type: ChannelType.GuildText },
          { name: 'ciencias', type: ChannelType.GuildText },
          { name: 'lengua', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🎧 ESTUDIO',
        channels: [
          { name: 'Sala de estudio', type: ChannelType.GuildVoice },
          { name: 'Tutoría', type: ChannelType.GuildVoice },
        ],
      },
    ],
    modules: { leveling: true, welcome: true, tickets: true },
  },
  eventos: {
    name: 'Eventos / Temporales',
    description: 'Check-in, giveaways, roles de participante',
    roles: [
      { name: 'Organizador', color: 0xe74c3c, perms: [PermissionFlagsBits.Administrator] },
      { name: 'Participante', color: 0x2ecc71, perms: [] },
    ],
    categories: [
      {
        name: '🎉 EVENTO',
        channels: [
          { name: 'info', type: ChannelType.GuildText },
          { name: 'check-in', type: ChannelType.GuildText },
          { name: 'sorteos', type: ChannelType.GuildText },
          { name: 'chat', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🔊 VOZ EVENTO',
        channels: [
          { name: 'Escenario', type: ChannelType.GuildVoice },
          { name: 'Waiting Room', type: ChannelType.GuildVoice },
        ],
      },
    ],
    modules: { giveaways: true, welcome: true, tempvc: true },
  },
  social: {
    name: 'Social / Amigos',
    description: 'Charla, memes, starboard, cumpleaños, temp voice',
    roles: [
      { name: 'Dueño', color: 0xe74c3c, perms: [PermissionFlagsBits.Administrator] },
      { name: 'Amigo', color: 0x3498db, perms: [] },
    ],
    categories: [
      {
        name: '💬 SOCIAL',
        channels: [
          { name: 'general', type: ChannelType.GuildText },
          { name: 'memes', type: ChannelType.GuildText },
          { name: 'starboard', type: ChannelType.GuildText },
          { name: 'cumpleanos', type: ChannelType.GuildText },
        ],
      },
      {
        name: '🔊 VOZ',
        channels: [
          { name: 'Hangout', type: ChannelType.GuildVoice },
          { name: 'Música', type: ChannelType.GuildVoice },
          { name: '➕ Crear VC', type: ChannelType.GuildVoice },
        ],
      },
    ],
    modules: { starboard: true, birthdays: true, tempvc: true, music: true, fun: true },
  },
};

function listBuiltin() {
  return Object.entries(BUILTIN).map(([id, t]) => ({
    id,
    name: t.name,
    description: t.description,
  }));
}

/**
 * Aplica plantilla REAL creando roles y canales
 */
async function apply(guild, templateId, progressChannel) {
  const tpl = BUILTIN[templateId];
  if (!tpl) throw new Error('Plantilla no encontrada.');

  const log = async (msg) => {
    if (progressChannel) await progressChannel.send(msg).catch(() => {});
  };

  await log(`⚡ Aplicando plantilla **${tpl.name}**...`);

  const createdRoles = {};
  for (const r of tpl.roles) {
    const role = await guild.roles.create({
      name: r.name,
      color: r.color,
      permissions: r.perms || [],
      reason: `God plantilla: ${tpl.name}`,
    });
    createdRoles[r.name] = role;
    await log(`🎭 Rol creado: **${r.name}**`);
  }

  const createdChannels = {};
  for (const cat of tpl.categories) {
    const category = await guild.channels.create({
      name: cat.name,
      type: ChannelType.GuildCategory,
      reason: `God plantilla: ${tpl.name}`,
    });
    await log(`📁 Categoría: **${cat.name}**`);
    for (const ch of cat.channels) {
      const channel = await guild.channels.create({
        name: ch.name,
        type: ch.type,
        parent: category.id,
        reason: `God plantilla: ${tpl.name}`,
      });
      createdChannels[ch.name] = channel;
      await log(`💬 Canal: **${ch.name}**`);
    }
  }

  // Configurar módulos y canales detectados
  const settings = {};
  if (createdChannels.bienvenida) settings.welcomeChannel = createdChannels.bienvenida.id;
  if (createdChannels.starboard) {
    settings.starboardChannel = createdChannels.starboard.id;
    settings.starboardMin = 3;
  }
  if (createdChannels['staff-logs'] || createdChannels['mod-logs']) {
    settings.logChannels = {
      mod: (createdChannels['mod-logs'] || createdChannels['staff-logs']).id,
      ticket: createdChannels['ticket-logs']?.id || null,
      member: (createdChannels['mod-logs'] || createdChannels['staff-logs']).id,
      message: (createdChannels['mod-logs'] || createdChannels['staff-logs']).id,
    };
  }
  if (createdChannels['ticket-logs']) settings.ticketLog = createdChannels['ticket-logs'].id;
  if (createdChannels.cumpleanos) settings.birthdayChannel = createdChannels.cumpleanos.id;
  if (createdChannels.confesiones) settings.confessionChannel = createdChannels.confesiones.id;
  if (createdRoles.Mod || createdRoles.Support || createdRoles.Moderación) {
    settings.modRole = (createdRoles.Mod || createdRoles.Support || createdRoles.Moderación).id;
  }
  if (createdRoles.Miembro || createdRoles.Cliente || createdRoles.Alumno || createdRoles.Amigo || createdRoles.Vecino) {
    const auto = createdRoles.Miembro || createdRoles.Cliente || createdRoles.Alumno || createdRoles.Amigo || createdRoles.Vecino;
    db.setModuleConfig(guild.id, 'welcome', { autoroles: [auto.id] });
  }

  db.setGuildSettings(guild.id, settings);
  for (const [mod, en] of Object.entries(tpl.modules || {})) {
    db.setModuleEnabled(guild.id, mod, en);
  }

  // Panel de tickets si hay canal
  const ticketCh = createdChannels.tickets || createdChannels['abrir-ticket'];
  if (ticketCh && tpl.modules?.tickets) {
    const tickets = require('./tickets');
    await ticketCh.send({
      embeds: [embeds.god('🎫 Soporte', 'Selecciona una categoría para abrir un ticket.')],
      components: tickets.panelComponents(),
    });
  }

  await log(`✅ Plantilla **${tpl.name}** aplicada. Roles: ${Object.keys(createdRoles).length}, canales creados.`);
  return { roles: createdRoles, channels: createdChannels };
}

function seedBuiltinToDb() {
  for (const [id, t] of Object.entries(BUILTIN)) {
    const existing = db.db
      .prepare('SELECT id FROM server_templates WHERE name = ? AND builtin = 1')
      .get(t.name);
    if (!existing) {
      db.db
        .prepare(
          'INSERT INTO server_templates (name, description, config_json, public, builtin) VALUES (?, ?, ?, 1, 1)'
        )
        .run(t.name, t.description, JSON.stringify({ id, ...t, roles: t.roles.map((r) => r.name) }));
    }
  }
}

module.exports = { BUILTIN, listBuiltin, apply, seedBuiltinToDb };
