/**
 * Wizard de configuración guiada — /god setup
 *
 * Recorre (automático o a elección) todas las secciones configurables del
 * bot, preguntando por cada canal/rol si ya existe (seleccionarlo) o si
 * hay que crearlo, y activando/desactivando módulos según lo que el admin
 * quiera usar.
 */
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

// ─── Definición declarativa de secciones ──────────────────────────────

const SECTIONS = [
  {
    key: 'welcome',
    emoji: '👋',
    title: 'Bienvenida y Despedida',
    desc: 'Mensajes automáticos cuando alguien entra o sale del servidor.',
    module: 'welcome',
    fields: [
      { key: 'welcomeChannel', label: 'Canal de bienvenida', type: 'channel', chType: ChannelType.GuildText, createName: 'bienvenida' },
      { key: 'leaveChannel', label: 'Canal de despedida', type: 'channel', chType: ChannelType.GuildText, createName: 'despedidas', optional: true },
      { key: 'welcomeDm', label: '¿Enviar también un DM de bienvenida al nuevo miembro?', type: 'toggle' },
    ],
  },
  {
    key: 'autorole',
    emoji: '🎭',
    title: 'Rol Automático',
    desc: 'Rol que se asigna automáticamente a quien se une al servidor.',
    module: 'welcome',
    fields: [
      { key: 'autorole', label: 'Rol automático al unirse', type: 'role', createName: 'Miembro', special: 'autorole' },
    ],
  },
  {
    key: 'moderation',
    emoji: '🛡️',
    title: 'Moderación — Rol de Staff',
    desc: 'Rol que identifica a tus moderadores para usar comandos de moderación.',
    module: null,
    fields: [
      { key: 'modRole', label: 'Rol de Moderador', type: 'role', createName: 'Moderador' },
    ],
  },
  {
    key: 'logging',
    emoji: '📋',
    title: 'Registro de Eventos (Logs)',
    desc: 'Canales donde God registrará moderación, mensajes, miembros y cambios del servidor.',
    module: 'logging',
    fields: [
      { key: 'logChannels.mod', label: 'Logs de moderación', type: 'channel', createName: 'mod-logs' },
      { key: 'logChannels.message', label: 'Logs de mensajes', type: 'channel', createName: 'msg-logs' },
      { key: 'logChannels.member', label: 'Logs de miembros', type: 'channel', createName: 'member-logs' },
      { key: 'logChannels.server', label: 'Logs del servidor', type: 'channel', createName: 'server-logs' },
    ],
  },
  {
    key: 'tickets',
    emoji: '🎫',
    title: 'Sistema de Tickets',
    desc: 'Soporte por tickets privados con categoría y canal de logs.',
    module: 'tickets',
    fields: [
      { key: 'ticketCategory', label: 'Categoría de tickets', type: 'channel', chType: ChannelType.GuildCategory, createName: 'Tickets' },
      { key: 'ticketLog', label: 'Canal de logs de tickets', type: 'channel', createName: 'ticket-logs' },
    ],
  },
  {
    key: 'leveling',
    emoji: '📈',
    title: 'Niveles (XP)',
    desc: 'Sistema de experiencia por chatear y hablar en voz.',
    module: 'leveling',
    fields: [
      { key: 'levelChannel', label: 'Canal de anuncios de level-up (opcional)', type: 'channel', createName: 'level-ups', optional: true },
    ],
  },
  {
    key: 'economy',
    emoji: '💰',
    title: 'Economía',
    desc: 'Monedas, daily, work, tienda y transferencias entre usuarios.',
    module: 'economy',
    fields: [],
  },
  {
    key: 'giveaways',
    emoji: '🎉',
    title: 'Sorteos',
    desc: 'Sorteos con botón de participación y requisitos configurables.',
    module: 'giveaways',
    fields: [],
  },
  {
    key: 'starboard',
    emoji: '⭐',
    title: 'Starboard',
    desc: 'Destaca los mensajes más votados con estrella en un canal especial.',
    module: 'starboard',
    fields: [
      { key: 'starboardChannel', label: 'Canal de starboard', type: 'channel', createName: 'starboard' },
    ],
  },
  {
    key: 'automod',
    emoji: '🤖',
    title: 'AutoMod',
    desc: 'Filtro automático de invitaciones, spam, mayúsculas y palabras prohibidas.',
    module: 'automod',
    fields: [],
  },
  {
    key: 'security',
    emoji: '🔐',
    title: 'Seguridad (Antiraid / Antinuke)',
    desc: 'Protección automática contra raids masivos y acciones destructivas de administradores comprometidos.',
    module: null,
    fields: [
      { key: 'antiraid', label: '¿Activar protección Antiraid?', type: 'module-toggle', moduleName: 'antiraid' },
      { key: 'antinuke', label: '¿Activar protección Antinuke?', type: 'module-toggle', moduleName: 'antinuke' },
    ],
  },
  {
    key: 'birthdays',
    emoji: '🎂',
    title: 'Cumpleaños',
    desc: 'Anuncia automáticamente los cumpleaños de los miembros.',
    module: 'birthdays',
    fields: [
      { key: 'birthdayChannel', label: 'Canal de cumpleaños', type: 'channel', createName: 'cumpleanos' },
      { key: 'birthdayRole', label: 'Rol de cumpleañero (opcional)', type: 'role', createName: 'Cumpleañero', optional: true },
    ],
  },
  {
    key: 'tempvc',
    emoji: '🔊',
    title: 'Canales de Voz Temporales',
    desc: 'Los usuarios crean su propio canal de voz privado al unirse a uno especial.',
    module: 'tempvc',
    fields: [
      { key: 'tempvcCategory', label: 'Categoría para los canales temporales', type: 'channel', chType: ChannelType.GuildCategory, createName: 'Canales de Voz' },
      { key: 'tempvcPanelChannel', label: 'Canal del panel "Crear canal" (opcional)', type: 'channel', createName: 'crear-canal', optional: true },
    ],
  },
  {
    key: 'stats',
    emoji: '📊',
    title: 'Canales de Estadísticas',
    desc: 'Canales de voz de solo lectura mostrando miembros, en línea y boosts.',
    module: 'stats',
    fields: [
      { key: 'statsChannelsAll', label: '¿Crear automáticamente los 3 canales de estadísticas?', type: 'stats-create' },
    ],
  },
  {
    key: 'confessions',
    emoji: '💬',
    title: 'Confesiones Anónimas',
    desc: 'Los miembros envían confesiones anónimas que el staff revisa antes de publicar.',
    module: 'confessions',
    fields: [
      { key: 'confessionChannel', label: 'Canal donde se publican las confesiones', type: 'channel', createName: 'confesiones' },
      { key: 'confessionReviewChannel', label: 'Canal de revisión para el staff (opcional)', type: 'channel', createName: 'confesiones-revision', optional: true },
    ],
  },
  {
    key: 'suggestions',
    emoji: '📝',
    title: 'Sugerencias',
    desc: 'Canal donde los miembros proponen ideas y el staff aprueba o rechaza.',
    module: 'suggestions',
    fields: [
      { key: 'suggestionChannel', label: 'Canal de sugerencias', type: 'channel', createName: 'sugerencias' },
    ],
  },
  {
    key: 'invites',
    emoji: '📨',
    title: 'Sistema de Invitaciones',
    desc: 'Rastrea quién invitó a cada miembro y permite premiar invitadores.',
    module: 'invites',
    fields: [],
  },
  {
    key: 'emotes',
    emoji: '😀',
    title: 'NQN (Emotes Externos)',
    desc: 'Usa emotes de otros servidores como si fueran Nitro.',
    module: 'emotes',
    fields: [],
  },
];

const SECTION_MAP = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

// ─── Estado en memoria por sesión (guildId:userId) ────────────────────

const sessions = new Map();
const SESSION_TTL_MS = 15 * 60_000;

function sKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function getSession(guildId, userId) {
  const key = sKey(guildId, userId);
  let s = sessions.get(key);
  if (!s) {
    s = { mode: null, order: [], secIdx: 0, fieldIdx: 0, summary: [], expiresAt: 0 };
    sessions.set(key, s);
  }
  s.expiresAt = Date.now() + SESSION_TTL_MS;
  return s;
}

function endSession(guildId, userId) {
  sessions.delete(sKey(guildId, userId));
}

setInterval(() => {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(key);
  }
}, 5 * 60_000).unref?.();

// ─── Helpers de guardado por campo ────────────────────────────────────

async function saveField(guildId, section, field, value) {
  if (field.type === 'module-toggle') {
    await db.setModuleEnabled(guildId, field.moduleName, value);
    return;
  }
  if (field.special === 'autorole') {
    const cur = await db.getModuleConfig(guildId, 'welcome');
    const autoroles = value ? [value] : [];
    await db.setModuleConfig(guildId, 'welcome', { autoroles });
    return;
  }
  if (field.type === 'stats-create') {
    return; // manejado aparte en handleStatsCreate
  }
  if (field.key.includes('.')) {
    const [parent, child] = field.key.split('.');
    const cur = await db.getGuildSettings(guildId);
    await db.setGuildSettings(guildId, { [parent]: { ...(cur[parent] || {}), [child]: value } });
    return;
  }
  await db.setGuildSettings(guildId, { [field.key]: value });
}

// ─── Construcción de embeds/componentes ───────────────────────────────

function buildMainMenuPayload(guildId) {
  const options = SECTIONS.map((s) => ({
    label: `${s.emoji} ${s.title}`,
    description: s.desc.slice(0, 90),
    value: s.key,
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId('sw:menu:pick')
    .setPlaceholder('Elige una sección para configurar manualmente...')
    .addOptions(options);

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sw:auto').setLabel('🚀 Configurar todo (guiado)').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('sw:done').setLabel('Terminar').setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [
      embeds.god(
        '⚡ Configuración Inicial de God',
        [
          '¡Hola! Vamos a configurar tu servidor paso a paso.',
          '',
          '**¿Por dónde quieres empezar?**',
          '• Pulsa **🚀 Configurar todo (guiado)** para que te pregunte sección por sección, en orden, sin que tengas que elegir nada.',
          '• O elige una sección específica en el menú de abajo si solo quieres tocar una cosa.',
          '',
          'En cada sección te preguntaré si ya tienes el canal/rol correspondiente (para seleccionarlo) o si quieres que lo cree por ti automáticamente.',
        ].join('\n')
      ),
    ],
    components: [select, buttons],
  };
}

function buildSectionIntroPayload(section) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sw:sec:${section.key}:yes`).setLabel('Sí, configurar').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId(`sw:sec:${section.key}:no`).setLabel('No, desactivar').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
    new ButtonBuilder().setCustomId('sw:menu').setLabel('Volver al menú').setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [
      embeds.god(
        `${section.emoji} ${section.title}`,
        `${section.desc}\n\n¿Quieres configurar y activar esta función?`
      ),
    ],
    components: [row],
  };
}

function buildFieldPayload(section, field) {
  const optTag = field.optional ? ' *(opcional)*' : '';

  if (field.type === 'toggle') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sw:fld:${field.key}:toggle_yes`).setLabel('Sí').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sw:fld:${field.key}:toggle_no`).setLabel('No').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embeds.god(section.title, field.label)], components: [row] };
  }

  if (field.type === 'module-toggle') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sw:fld:${field.key}:toggle_yes`).setLabel('Activar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sw:fld:${field.key}:toggle_no`).setLabel('Desactivar').setStyle(ButtonStyle.Secondary)
    );
    return { embeds: [embeds.god(section.title, field.label)], components: [row] };
  }

  if (field.type === 'stats-create') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sw:fld:${field.key}:stats_yes`).setLabel('Sí, créalos').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`sw:fld:${field.key}:skip`).setLabel('Omitir').setStyle(ButtonStyle.Secondary)
    );
    return {
      embeds: [
        embeds.god(
          section.title,
          `${field.label}\n\nSe crearán 3 canales de voz: "Miembros: 0", "En línea: 0" y "Boosts: 0".`
        ),
      ],
      components: [row],
    };
  }

  // channel / role: preguntar si ya lo tiene
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`sw:fld:${field.key}:have`).setLabel('Ya lo tengo, seleccionar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`sw:fld:${field.key}:create`).setLabel('Créalo por mí').setStyle(ButtonStyle.Success),
    ...(field.optional
      ? [new ButtonBuilder().setCustomId(`sw:fld:${field.key}:skip`).setLabel('Omitir').setStyle(ButtonStyle.Secondary)]
      : [])
  );

  return {
    embeds: [
      embeds.god(
        section.title,
        `**${field.label}${optTag}**\n\n¿Ya tienes ${field.type === 'role' ? 'el rol' : 'el canal'} o quieres que lo cree por ti?`
      ),
    ],
    components: [row],
  };
}

function buildPickerPayload(field) {
  if (field.type === 'role') {
    const select = new RoleSelectMenuBuilder()
      .setCustomId(`sw:pickrole:${field.key}`)
      .setPlaceholder(`Selecciona: ${field.label}`);
    return { embeds: [embeds.god('Selecciona el rol', field.label)], components: [new ActionRowBuilder().addComponents(select)] };
  }
  const select = new ChannelSelectMenuBuilder()
    .setCustomId(`sw:pickch:${field.key}`)
    .setPlaceholder(`Selecciona: ${field.label}`)
    .setChannelTypes(field.chType ? [field.chType] : [ChannelType.GuildText]);
  return { embeds: [embeds.god('Selecciona el canal', field.label)], components: [new ActionRowBuilder().addComponents(select)] };
}

function buildSectionDonePayload(section, mode) {
  const row = new ActionRowBuilder().addComponents(
    ...(mode === 'auto'
      ? [new ButtonBuilder().setCustomId('sw:next_section').setLabel('Siguiente sección ▶️').setStyle(ButtonStyle.Success)]
      : [new ButtonBuilder().setCustomId('sw:menu').setLabel('Volver al menú').setStyle(ButtonStyle.Primary)]),
    new ButtonBuilder().setCustomId('sw:done').setLabel('Terminar aquí').setStyle(ButtonStyle.Secondary)
  );
  return {
    embeds: [embeds.success(`${section.emoji} ${section.title} — Listo`, '✅ Sección configurada correctamente.')],
    components: [row],
  };
}

function buildFinalSummaryPayload(session) {
  const lines = session.summary.length
    ? session.summary.map((l) => `• ${l}`).join('\n')
    : 'No se realizaron cambios en esta sesión.';
  return {
    embeds: [
      embeds.god(
        '⚡ Configuración completada',
        `**Resumen de esta sesión:**\n${lines}\n\nPuedes volver a ejecutar \`/god setup\` cuando quieras para ajustar algo más.`
      ),
    ],
    components: [],
  };
}

// ─── Flujo principal ───────────────────────────────────────────────────

async function startWizard(interaction) {
  endSession(interaction.guild.id, interaction.user.id);
  await db.ensureGuild(interaction.guild.id);
  return interaction.reply({ ...buildMainMenuPayload(interaction.guild.id), ephemeral: true });
}

async function showMenu(interaction) {
  endSession(interaction.guild.id, interaction.user.id);
  return interaction.update(buildMainMenuPayload(interaction.guild.id));
}

async function startAuto(interaction) {
  const s = getSession(interaction.guild.id, interaction.user.id);
  s.mode = 'auto';
  s.order = SECTIONS.map((sec) => sec.key);
  s.secIdx = 0;
  s.fieldIdx = 0;
  return enterSection(interaction, s);
}

async function pickSection(interaction, sectionKey) {
  const s = getSession(interaction.guild.id, interaction.user.id);
  s.mode = 'manual';
  s.order = [sectionKey];
  s.secIdx = 0;
  s.fieldIdx = 0;
  return enterSection(interaction, s);
}

async function enterSection(interaction, s) {
  const key = s.order[s.secIdx];
  const section = SECTION_MAP[key];
  if (!section) return finishWizard(interaction, s);
  return interaction.update(buildSectionIntroPayload(section));
}

async function confirmSection(interaction, sectionKey, wants) {
  const s = getSession(interaction.guild.id, interaction.user.id);
  const section = SECTION_MAP[sectionKey];
  if (!section) return showMenu(interaction);

  if (!wants) {
    if (section.module) await db.setModuleEnabled(interaction.guild.id, section.module, false);
    s.summary.push(`${section.emoji} ${section.title}: desactivado`);
    return advanceAfterSection(interaction, s, section);
  }

  if (section.module) await db.setModuleEnabled(interaction.guild.id, section.module, true);

  if (!section.fields.length) {
    s.summary.push(`${section.emoji} ${section.title}: activado`);
    return interaction.update(buildSectionDonePayload(section, s.mode));
  }

  s.fieldIdx = 0;
  return interaction.update(buildFieldPayload(section, section.fields[0]));
}

async function advanceField(interaction, sectionKey) {
  const s = getSession(interaction.guild.id, interaction.user.id);
  const section = SECTION_MAP[sectionKey];
  s.fieldIdx += 1;
  if (s.fieldIdx >= section.fields.length) {
    s.summary.push(`${section.emoji} ${section.title}: configurado`);
    return interaction.update(buildSectionDonePayload(section, s.mode));
  }
  return interaction.update(buildFieldPayload(section, section.fields[s.fieldIdx]));
}

async function advanceAfterSection(interaction, s, section) {
  if (s.mode === 'auto') {
    s.secIdx += 1;
    if (s.secIdx >= s.order.length) return finishWizard(interaction, s);
    return enterSection(interaction, s);
  }
  return interaction.update(buildSectionDonePayload(section, s.mode));
}

async function nextSection(interaction) {
  const s = getSession(interaction.guild.id, interaction.user.id);
  s.secIdx += 1;
  if (s.secIdx >= s.order.length) return finishWizard(interaction, s);
  return enterSection(interaction, s);
}

async function finishWizard(interaction, s) {
  const payload = buildFinalSummaryPayload(s);
  endSession(interaction.guild.id, interaction.user.id);
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.update(payload);
}

// ─── Manejo de botones ─────────────────────────────────────────────────

async function handleButton(interaction) {
  const id = interaction.customId;

  if (id === 'sw:menu') return showMenu(interaction);
  if (id === 'sw:auto') return startAuto(interaction);
  if (id === 'sw:done') {
    const s = getSession(interaction.guild.id, interaction.user.id);
    return finishWizard(interaction, s);
  }
  if (id === 'sw:next_section') return nextSection(interaction);

  const secMatch = id.match(/^sw:sec:([a-z]+):(yes|no)$/);
  if (secMatch) {
    return confirmSection(interaction, secMatch[1], secMatch[2] === 'yes');
  }

  const fldMatch = id.match(/^sw:fld:(.+):(have|create|skip|toggle_yes|toggle_no|stats_yes)$/);
  if (fldMatch) {
    const [, fieldKey, action] = fldMatch;
    const s = getSession(interaction.guild.id, interaction.user.id);
    const sectionKey = s.order[s.secIdx];
    const section = SECTION_MAP[sectionKey];
    const field = section.fields.find((f) => f.key === fieldKey);
    if (!field) return showMenu(interaction);

    if (action === 'have') {
      return interaction.update(buildPickerPayload(field));
    }

    if (action === 'skip') {
      return advanceField(interaction, sectionKey);
    }

    if (action === 'toggle_yes' || action === 'toggle_no') {
      const val = action === 'toggle_yes';
      await saveField(interaction.guild.id, section, field, val);
      s.summary.push(`${section.emoji} ${field.label}: ${val ? 'Sí' : 'No'}`);
      return advanceField(interaction, sectionKey);
    }

    if (action === 'create') {
      await interaction.deferUpdate();
      try {
        let created;
        if (field.type === 'role') {
          created = await interaction.guild.roles.create({
            name: field.createName,
            reason: `God setup: ${section.title}`,
          });
          await saveField(interaction.guild.id, section, field, created.id);
          s.summary.push(`${section.emoji} ${field.label}: rol creado @${created.name}`);
        } else {
          created = await interaction.guild.channels.create({
            name: field.createName,
            type: field.chType || ChannelType.GuildText,
            reason: `God setup: ${section.title}`,
          });
          await saveField(interaction.guild.id, section, field, created.id);
          s.summary.push(`${section.emoji} ${field.label}: canal creado #${created.name}`);
        }
      } catch (err) {
        logger.error('[setupWizard] create field error:', err.message);
        s.summary.push(`${section.emoji} ${field.label}: ❌ error al crear (${err.message})`);
      }
      return advanceFieldSilent(interaction, sectionKey);
    }

    if (action === 'stats_yes') {
      await interaction.deferUpdate();
      try {
        const membersCh = await interaction.guild.channels.create({
          name: `Miembros: ${interaction.guild.memberCount}`,
          type: ChannelType.GuildVoice,
          reason: 'God setup: stats',
        });
        const onlineCh = await interaction.guild.channels.create({
          name: 'En línea: 0',
          type: ChannelType.GuildVoice,
          reason: 'God setup: stats',
        });
        const boostsCh = await interaction.guild.channels.create({
          name: `Boosts: ${interaction.guild.premiumSubscriptionCount || 0}`,
          type: ChannelType.GuildVoice,
          reason: 'God setup: stats',
        });
        await db.setGuildSettings(interaction.guild.id, {
          statsChannels: { members: membersCh.id, online: onlineCh.id, boosts: boostsCh.id },
        });
        s.summary.push(`${section.emoji} Canales de estadísticas creados`);
      } catch (err) {
        logger.error('[setupWizard] stats create error:', err.message);
        s.summary.push(`${section.emoji} Estadísticas: ❌ error al crear (${err.message})`);
      }
      return advanceFieldSilent(interaction, sectionKey);
    }
  }

  return showMenu(interaction);
}

// Variante de advanceField para usar después de un deferUpdate() (edita en vez de update)
async function advanceFieldSilent(interaction, sectionKey) {
  const s = getSession(interaction.guild.id, interaction.user.id);
  const section = SECTION_MAP[sectionKey];
  s.fieldIdx += 1;
  if (s.fieldIdx >= section.fields.length) {
    s.summary.push(`${section.emoji} ${section.title}: configurado`);
    return interaction.editReply(buildSectionDonePayload(section, s.mode));
  }
  return interaction.editReply(buildFieldPayload(section, section.fields[s.fieldIdx]));
}

// ─── Manejo de selects (menú principal, canal, rol) ───────────────────

async function handleStringSelect(interaction) {
  if (interaction.customId === 'sw:menu:pick') {
    const sectionKey = interaction.values[0];
    return pickSection(interaction, sectionKey);
  }
}

async function handleChannelSelect(interaction) {
  const m = interaction.customId.match(/^sw:pickch:(.+)$/);
  if (!m) return;
  const fieldKey = m[1];
  const s = getSession(interaction.guild.id, interaction.user.id);
  const sectionKey = s.order[s.secIdx];
  const section = SECTION_MAP[sectionKey];
  const field = section.fields.find((f) => f.key === fieldKey);
  if (!field) return showMenu(interaction);

  const channel = interaction.channels.first();
  await saveField(interaction.guild.id, section, field, channel.id);
  s.summary.push(`${section.emoji} ${field.label}: ${channel.type === ChannelType.GuildCategory ? channel.name : '#' + channel.name}`);
  return advanceField(interaction, sectionKey);
}

async function handleRoleSelect(interaction) {
  const m = interaction.customId.match(/^sw:pickrole:(.+)$/);
  if (!m) return;
  const fieldKey = m[1];
  const s = getSession(interaction.guild.id, interaction.user.id);
  const sectionKey = s.order[s.secIdx];
  const section = SECTION_MAP[sectionKey];
  const field = section.fields.find((f) => f.key === fieldKey);
  if (!field) return showMenu(interaction);

  const role = interaction.roles.first();
  await saveField(interaction.guild.id, section, field, role.id);
  s.summary.push(`${section.emoji} ${field.label}: @${role.name}`);
  return advanceField(interaction, sectionKey);
}

module.exports = {
  startWizard,
  handleButton,
  handleStringSelect,
  handleChannelSelect,
  handleRoleSelect,
};
