const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ChannelType,
} = require('discord.js');
const embeds = require('../utils/embeds');
const config = require('../config');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

const MODULE_LIST = Object.keys(db.DEFAULT_MODULES);

function buildHelpCategory(cat, client) {
  const map = {
    general: ['god', 'ayuda', 'invite', 'dashboard', 'plantilla', 'ask'],
    moderacion: ['moderacion', 'automod', 'modlogs', 'seguridad'],
    tickets: ['ticket'],
    niveles: ['nivel'],
    sorteos: ['sorteo'],
    roles: ['rol'],
    bienvenida: ['bienvenida'],
    economia: ['economia'],
    musica: ['musica'],
    util: [
      'util',
      'afk',
      'recordatorio',
      'tag',
      'invites',
      'stats',
      'starboard',
      'cumpleanos',
      'tempvc',
      'embed',
      'aplicacion',
      'confesar',
      'emote',
      'sugerir',
    ],
  };
  const names = cat === 'all' ? [...client.commands.keys()] : map[cat] || [];
  const lines = names
    .filter((n) => client.commands.has(n))
    .map((n) => {
      const c = client.commands.get(n);
      return `\`/${n}\` — ${c.data.description}`;
    });
  return embeds.god(
    cat === 'all' ? 'Comandos de God' : `Categoría: ${cat}`,
    (cat === 'all' ? `**${config.bot.description}**\n\n` : '') +
      (lines.join('\n') || 'Sin comandos.') +
      '\n\n*Usa subcomandos: `/moderacion ban`, `/god setup`, etc.*'
  );
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('god')
    .setDescription('Panel principal de God Bot')
    .addSubcommand((s) => s.setName('setup').setDescription('Wizard de configuración inicial'))
    .addSubcommand((s) => s.setName('config').setDescription('Activar/desactivar módulos'))
    .addSubcommand((s) => s.setName('stats').setDescription('Estadísticas del bot'))
    .addSubcommand((s) =>
      s
        .setName('logs')
        .setDescription('Configura canales de logs')
        .addChannelOption((o) =>
          o
            .setName('mod')
            .setDescription('Logs de moderación')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((o) =>
          o
            .setName('mensajes')
            .setDescription('Logs de mensajes')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((o) =>
          o
            .setName('miembros')
            .setDescription('Logs de joins/leaves')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addChannelOption((o) =>
          o
            .setName('tickets')
            .setDescription('Logs de tickets')
            .addChannelTypes(ChannelType.GuildText)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('modrole')
        .setDescription('Define el rol de staff/mods')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol de moderación').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('preguntar')
        .setDescription('Pregunta a la IA de God (Grok)')
        .addStringOption((o) => o.setName('pregunta').setDescription('Tu pregunta').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('resumir')
        .setDescription('Resume los últimos mensajes del canal con IA')
        .addIntegerOption((o) =>
          o.setName('cantidad').setDescription('Mensajes a analizar (10-50)').setMinValue(10).setMaxValue(50)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('idioma')
        .setDescription('Idioma del servidor (ES/EN)')
        .addStringOption((o) =>
          o
            .setName('lang')
            .setDescription('Idioma')
            .setRequired(true)
            .addChoices({ name: 'Español', value: 'es' }, { name: 'English', value: 'en' })
        )
    ),
  buildCategory: buildHelpCategory,
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'preguntar' || sub === 'resumir') {
      const ask = client.commands.get('ask');
      if (sub === 'preguntar') {
        // reuse ask logic
        const OpenAI = require('openai');
        const { truncate } = require('../utils/helpers');
        if (!config.xai.apiKey) {
          return interaction.reply({
            embeds: [embeds.warning('IA', 'Configura XAI_API_KEY en .env')],
            ephemeral: true,
          });
        }
        const question = interaction.options.getString('pregunta');
        await interaction.deferReply();
        const ai = new OpenAI({ apiKey: config.xai.apiKey, baseURL: config.xai.baseURL });
        try {
          let answer = '';
          try {
            const resp = await ai.responses.create({
              model: config.xai.model,
              input: [
                {
                  role: 'system',
                  content: `Eres God, bot del servidor ${interaction.guild.name}. Responde en español, útil y conciso.`,
                },
                { role: 'user', content: question },
              ],
              max_output_tokens: 900,
            });
            answer = resp.output_text || '';
          } catch {
            const c = await ai.chat.completions.create({
              model: config.xai.model,
              messages: [
                { role: 'system', content: 'Eres God, bot Discord. Español, útil, conciso.' },
                { role: 'user', content: question },
              ],
              max_tokens: 900,
            });
            answer = c.choices?.[0]?.message?.content || '';
          }
          await db.insertAiLog(interaction.guild.id, interaction.user.id, question, answer);
          return interaction.editReply({
            embeds: [embeds.god('God responde', truncate(answer, 4000))],
          });
        } catch (err) {
          return interaction.editReply({ embeds: [embeds.error('IA', err.message)] });
        }
      }
      // resumir
      await interaction.deferReply();
      const n = interaction.options.getInteger('cantidad') || 30;
      const msgs = await interaction.channel.messages.fetch({ limit: n });
      const text = [...msgs.values()]
        .reverse()
        .map((m) => `${m.author.username}: ${m.content}`)
        .join('\n')
        .slice(0, 8000);
      if (!config.xai.apiKey) {
        return interaction.editReply({ embeds: [embeds.warning('IA', 'Falta XAI_API_KEY')] });
      }
      const OpenAI = require('openai');
      const ai = new OpenAI({ apiKey: config.xai.apiKey, baseURL: config.xai.baseURL });
      try {
        const c = await ai.chat.completions.create({
          model: config.xai.model,
          messages: [
            { role: 'system', content: 'Resume la conversación en español, puntos clave, tono neutral.' },
            { role: 'user', content: text || 'Sin mensajes.' },
          ],
          max_tokens: 600,
        });
        const answer = c.choices?.[0]?.message?.content || 'Sin resumen.';
        return interaction.editReply({ embeds: [embeds.god('📝 Resumen del canal', answer)] });
      } catch (err) {
        return interaction.editReply({ embeds: [embeds.error('IA', err.message)] });
      }
    }

    if (sub === 'idioma') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo administradores')], ephemeral: true });
      }
      const lang = interaction.options.getString('lang');
      await db.ensureGuild(interaction.guild.id);
      await db.setGuildSettings(interaction.guild.id, { language: lang });
      return interaction.reply({
        embeds: [embeds.success('Idioma', lang === 'es' ? 'Español' : 'English')],
      });
    }

    if (sub === 'stats') {
      const mem = process.memoryUsage();
      return interaction.reply({
        embeds: [
          embeds
            .god('Stats de God', config.bot.description)
            .setThumbnail(client.user.displayAvatarURL())
            .addFields(
              { name: 'Servidores', value: `${client.guilds.cache.size}`, inline: true },
              { name: 'Usuarios (cache)', value: `${client.users.cache.size}`, inline: true },
              { name: 'Comandos', value: `${client.commands.size}`, inline: true },
              { name: 'Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
              { name: 'Uptime', value: `<t:${Math.floor((Date.now() - client.uptime) / 1000)}:R>`, inline: true },
              { name: 'RAM', value: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`, inline: true },
              { name: 'Versión', value: config.bot.version, inline: true },
              { name: 'Node', value: process.version, inline: true }
            ),
        ],
      });
    }

    if (sub === 'setup') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo administradores')], ephemeral: true });
      }
      await db.ensureGuild(interaction.guild.id);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('setup_modules')
          .setLabel('Ver módulos')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🧩'),
        new ButtonBuilder()
          .setCustomId('setup_done')
          .setLabel('Listo')
          .setStyle(ButtonStyle.Success)
          .setEmoji('⚡')
      );
      return interaction.reply({
        embeds: [
          embeds.god(
            'Wizard de Setup — God',
            [
              '**¡Por el poder de God, configuremos tu servidor!**',
              '',
              '**Checklist recomendado:**',
              '1️⃣ `/god modrole @Staff` — rol de moderadores',
              '2️⃣ `/god logs mod:#mod-logs mensajes:#msg-logs miembros:#joins`',
              '3️⃣ `/bienvenida canal #bienvenidas`',
              '4️⃣ `/ticket panel` — panel de soporte',
              '5️⃣ `/automod toggle activo:True`',
              '6️⃣ `/nivel config` — canal de level-ups',
              '7️⃣ `/rol auto @Miembro` — autorole',
              '',
              'Módulos activos por defecto: moderación, tickets, niveles, giveaways, economía, logging…',
              'Usa `/god config` para activar/desactivar.',
            ].join('\n')
          ),
        ],
        components: [row],
        ephemeral: true,
      });
    }

    if (sub === 'config') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo administradores')], ephemeral: true });
      }
      const moduleStates = await Promise.all(MODULE_LIST.map(
        async (m) => ({ m, enabled: await db.isModuleEnabled(interaction.guild.id, m) })
      ));
      const body = moduleStates.map(
        ({ m, enabled }) => `${enabled ? '✅' : '❌'} **${m}**`
      ).join('\n');
      const select = new StringSelectMenuBuilder()
        .setCustomId('god_module_toggle')
        .setPlaceholder('Toggle módulo...')
        .addOptions(
          moduleStates.slice(0, 25).map(({ m, enabled }) => ({
            label: m,
            value: m,
            description: enabled ? 'ON — click para OFF' : 'OFF — click para ON',
          }))
        );
      return interaction.reply({
        embeds: [embeds.god('Configuración de módulos', body)],
        components: [new ActionRowBuilder().addComponents(select)],
        ephemeral: true,
      });
    }

    if (sub === 'logs') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo administradores')], ephemeral: true });
      }
      const mod = interaction.options.getChannel('mod');
      const mensajes = interaction.options.getChannel('mensajes');
      const miembros = interaction.options.getChannel('miembros');
      const tickets = interaction.options.getChannel('tickets');
      const patch = { logChannels: {} };
      if (mod) patch.logChannels.mod = mod.id;
      if (mensajes) patch.logChannels.message = mensajes.id;
      if (miembros) patch.logChannels.member = miembros.id;
      if (tickets) patch.logChannels.ticket = tickets.id;
      if (!Object.keys(patch.logChannels).length) {
        const s = await db.getGuildSettings(interaction.guild.id);
        return interaction.reply({
          embeds: [
            embeds.info(
              'Logs actuales',
              [
                `Mod: ${s.logChannels.mod ? `<#${s.logChannels.mod}>` : '—'}`,
                `Mensajes: ${s.logChannels.message ? `<#${s.logChannels.message}>` : '—'}`,
                `Miembros: ${s.logChannels.member ? `<#${s.logChannels.member}>` : '—'}`,
                `Tickets: ${s.logChannels.ticket ? `<#${s.logChannels.ticket}>` : '—'}`,
              ].join('\n')
            ),
          ],
          ephemeral: true,
        });
      }
      await db.setGuildSettings(interaction.guild.id, patch);
      return interaction.reply({
        embeds: [embeds.success('Logs actualizados', 'Canales de logging configurados.')],
      });
    }

    if (sub === 'modrole') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo administradores')], ephemeral: true });
      }
      const role = interaction.options.getRole('rol');
      await db.setGuildSettings(interaction.guild.id, { modRole: role.id });
      return interaction.reply({
        embeds: [embeds.success('Rol de staff', `Los miembros con ${role} se tratan como moderadores de God.`)],
      });
    }
  },
};
