const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const embeds = require('../utils/embeds');
const { pick, randomInt } = require('../utils/helpers');
const db = require('../database/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('util')
    .setDescription('Utilidades y diversión')
    .addSubcommand((s) => s.setName('ping').setDescription('Latencia'))
    .addSubcommand((s) =>
      s
        .setName('avatar')
        .setDescription('Avatar de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) =>
      s
        .setName('userinfo')
        .setDescription('Info de usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) => s.setName('serverinfo').setDescription('Info del servidor'))
    .addSubcommand((s) =>
      s
        .setName('encuesta')
        .setDescription('Encuesta con botones y conteo live')
        .addStringOption((o) => o.setName('pregunta').setDescription('Pregunta').setRequired(true))
        .addStringOption((o) =>
          o.setName('opciones').setDescription('Opciones separadas por | (2-5)').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('8ball')
        .setDescription('Bola mágica')
        .addStringOption((o) => o.setName('pregunta').setDescription('Pregunta').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('dados')
        .setDescription('Lanza dados')
        .addIntegerOption((o) => o.setName('caras').setDescription('Caras').setMinValue(2).setMaxValue(1000))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Dados').setMinValue(1).setMaxValue(20))
    )
    .addSubcommand((s) => s.setName('moneda').setDescription('Cara o cruz'))
    .addSubcommand((s) => s.setName('trivia').setDescription('Pregunta de trivia rápida'))
    .addSubcommand((s) => s.setName('meme').setDescription('Meme aleatorio (API pública)'))
    .addSubcommand((s) =>
      s
        .setName('say')
        .setDescription('God dice algo')
        .addStringOption((o) => o.setName('mensaje').setDescription('Texto').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('roleinfo')
        .setDescription('Info de un rol')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
    ),
  async execute(interaction, client) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'ping') {
      const sent = await interaction.reply({ embeds: [embeds.info('Ping', '...')], fetchReply: true });
      const lat = sent.createdTimestamp - interaction.createdTimestamp;
      return interaction.editReply({
        embeds: [
          embeds.god('Pong!', null).addFields(
            { name: 'Bot', value: `${lat}ms`, inline: true },
            { name: 'API', value: `${Math.round(client.ws.ping)}ms`, inline: true }
          ),
        ],
      });
    }

    if (sub === 'avatar') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      return interaction.reply({
        embeds: [
          embeds
            .info(`Avatar · ${user.tag}`, `[PNG](${user.displayAvatarURL({ size: 4096, extension: 'png' })})`)
            .setImage(user.displayAvatarURL({ size: 512 })),
        ],
      });
    }

    if (sub === 'userinfo') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      const e = embeds
        .info(user.tag, null)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
          { name: 'ID', value: user.id, inline: true },
          { name: 'Cuenta', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
        );
      if (member?.joinedTimestamp) {
        e.addFields({
          name: 'Entró',
          value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`,
          inline: true,
        });
      }
      return interaction.reply({ embeds: [e] });
    }

    if (sub === 'serverinfo') {
      const g = interaction.guild;
      return interaction.reply({
        embeds: [
          embeds
            .god(g.name, g.description || null)
            .setThumbnail(g.iconURL({ size: 256 }))
            .addFields(
              { name: 'ID', value: g.id, inline: true },
              { name: 'Miembros', value: `${g.memberCount}`, inline: true },
              { name: 'Creado', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
              { name: 'Roles', value: `${g.roles.cache.size}`, inline: true },
              { name: 'Canales', value: `${g.channels.cache.size}`, inline: true },
              { name: 'Boost', value: `Nivel ${g.premiumTier}`, inline: true }
            ),
        ],
      });
    }

    if (sub === 'encuesta') {
      const question = interaction.options.getString('pregunta');
      const options = interaction.options
        .getString('opciones')
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5);
      if (options.length < 2) {
        return interaction.reply({
          embeds: [embeds.error('Mínimo 2 opciones con `|`')],
          ephemeral: true,
        });
      }
      const pollId = Date.now().toString(36);
      const votes = {};
      const row = new ActionRowBuilder().addComponents(
        ...options.map((opt, i) =>
          new ButtonBuilder()
            .setCustomId(`poll_vote:${pollId}:${i}`)
            .setLabel(opt.slice(0, 80))
            .setStyle(ButtonStyle.Primary)
        )
      );
      const body = options.map((o, i) => `**${i + 1}.** ${o} — \`0\``).join('\n');
      const msg = await interaction.reply({
        embeds: [embeds.god('📊 Encuesta', `**${question}**\n\n${body}`)],
        components: [row],
        fetchReply: true,
      });
      await db.createPoll({
        id: pollId,
        guild_id: interaction.guild.id,
        channel_id: interaction.channel.id,
        message_id: msg.id,
        question,
        options,
        votes: {},
      });
      return;
    }

    if (sub === '8ball') {
      const answers = [
        'Es cierto.',
        'Definitivamente sí.',
        'Sin duda.',
        'Las perspectivas son buenas.',
        'Respuesta confusa…',
        'Pregunta más tarde.',
        'No cuentes con ello.',
        'Mis fuentes dicen que no.',
        'God ha hablado: SÍ.',
        'God ha hablado: NO.',
      ];
      return interaction.reply({
        embeds: [
          embeds.god(
            '🎱 Bola 8',
            `**${interaction.options.getString('pregunta')}**\n→ ${pick(answers)}`
          ),
        ],
      });
    }

    if (sub === 'dados') {
      const faces = interaction.options.getInteger('caras') || 6;
      const count = interaction.options.getInteger('cantidad') || 1;
      const rolls = Array.from({ length: count }, () => randomInt(1, faces));
      return interaction.reply({
        embeds: [
          embeds.god(
            '🎲 Dados',
            count === 1
              ? `**${rolls[0]}** (d${faces})`
              : `${rolls.map((r) => `\`${r}\``).join(', ')} → **${rolls.reduce((a, b) => a + b, 0)}**`
          ),
        ],
      });
    }

    if (sub === 'moneda') {
      return interaction.reply({
        embeds: [embeds.god('🪙 Moneda', Math.random() < 0.5 ? '**Cara**' : '**Cruz**')],
      });
    }

    if (sub === 'trivia') {
      const qs = [
        { q: '¿Capital de España?', a: 'madrid' },
        { q: '¿Cuántos bits tiene un byte?', a: '8' },
        { q: '¿Quién pintó la Mona Lisa?', a: 'leonardo' },
        { q: '¿Planeta rojo?', a: 'marte' },
        { q: '¿Año de lanzamiento de Discord?', a: '2015' },
      ];
      const item = pick(qs);
      const id = `trivia:${interaction.user.id}:${Buffer.from(item.a).toString('base64url')}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${id}:ok`).setLabel('Responder en modal…').setStyle(ButtonStyle.Primary)
      );
      // Store answer briefly via custom id encoding
      return interaction.reply({
        embeds: [
          embeds.god(
            '🧠 Trivia',
            `**${item.q}**\nResponde con el botón (tienes 60s). Respuesta esperada: una palabra clave.`
          ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`trivia_ans:${Buffer.from(item.a).toString('base64url')}`)
              .setLabel('Escribir respuesta')
              .setStyle(ButtonStyle.Success)
          ),
        ],
        ephemeral: true,
      });
    }

    if (sub === 'meme') {
      await interaction.deferReply();
      try {
        const res = await fetch('https://meme-api.com/gimme');
        const data = await res.json();
        return interaction.editReply({
          embeds: [
            embeds
              .god(data.title || 'Meme', `r/${data.subreddit || 'memes'}`)
              .setImage(data.url)
              .setURL(data.postLink || null),
          ],
        });
      } catch (err) {
        return interaction.editReply({
          embeds: [embeds.error('Meme', 'No se pudo obtener un meme ahora.')],
        });
      }
    }

    if (sub === 'say') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return interaction.reply({ embeds: [embeds.error('Sin permisos')], ephemeral: true });
      }
      await interaction.reply({ content: '✅', ephemeral: true });
      return interaction.channel.send({ content: interaction.options.getString('mensaje') });
    }

    if (sub === 'roleinfo') {
      const role = interaction.options.getRole('rol');
      return interaction.reply({
        embeds: [
          embeds
            .info(role.name, null)
            .setColor(role.color || 0x99aab5)
            .addFields(
              { name: 'ID', value: role.id, inline: true },
              { name: 'Miembros', value: `${role.members.size}`, inline: true },
              { name: 'Mencionable', value: role.mentionable ? 'Sí' : 'No', inline: true },
              { name: 'Posición', value: `${role.position}`, inline: true },
              { name: 'Color', value: role.hexColor, inline: true },
              { name: 'Creado', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:R>`, inline: true }
            ),
        ],
      });
    }
  },
};
