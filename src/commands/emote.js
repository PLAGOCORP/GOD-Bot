const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const nqn = require('../modules/nqn');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('emote')
    .setDescription('Gestor de emotes + NQN')
    .addSubcommand((s) =>
      s
        .setName('agregar')
        .setDescription('Añade un emote al pack del servidor (URL)')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre :nombre:').setRequired(true))
        .addStringOption((o) => o.setName('url').setDescription('URL de imagen/gif').setRequired(true))
        .addBooleanOption((o) => o.setName('animado').setDescription('Es GIF'))
    )
    .addSubcommand((s) =>
      s
        .setName('robar')
        .setDescription('Roba un emoji de un mensaje (copia al servidor)')
        .addStringOption((o) =>
          o.setName('emoji').setDescription('Emoji personalizado <:name:id>').setRequired(true)
        )
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Lista emotes del pack'))
    .addSubcommand((s) =>
      s
        .setName('jumbo')
        .setDescription('Muestra un emoji en grande')
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('nqn')
        .setDescription('Activa/desactiva NQN (:emoji: → webhook)')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'agregar') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const nombre = interaction.options.getString('nombre').replace(/:/g, '');
      const url = interaction.options.getString('url');
      const animado = interaction.options.getBoolean('animado') || url.endsWith('.gif');
      await nqn.addEmote(interaction.guild.id, nombre, url, animado);
      return interaction.reply({
        embeds: [embeds.success('Emote añadido', `Usa \`:${nombre}:\` en el chat (NQN).`)],
      });
    }

    if (sub === 'robar') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuildExpressions)) {
        return interaction.reply({ embeds: [embeds.error('Necesitas Manage Expressions')], ephemeral: true });
      }
      const raw = interaction.options.getString('emoji');
      const m = raw.match(/<(a)?:(\w+):(\d+)>/);
      if (!m) {
        return interaction.reply({
          embeds: [embeds.error('Pasa un emoji personalizado como `<:nombre:id>`')],
          ephemeral: true,
        });
      }
      const animated = !!m[1];
      const name = m[2];
      const id = m[3];
      const ext = animated ? 'gif' : 'png';
      const url = `https://cdn.discordapp.com/emojis/${id}.${ext}`;
      try {
        const emoji = await interaction.guild.emojis.create({ attachment: url, name });
        return interaction.reply({
          embeds: [embeds.success('Emoji robado', `${emoji} añadido al servidor.`)],
        });
      } catch (err) {
        return interaction.reply({
          embeds: [embeds.error('No se pudo crear el emoji', err.message)],
          ephemeral: true,
        });
      }
    }

    if (sub === 'lista') {
      const list = await nqn.listEmotes(interaction.guild.id);
      if (!list.length) {
        return interaction.reply({ embeds: [embeds.info('Emotes', 'Pack vacío. `/emote agregar`')] });
      }
      return interaction.reply({
        embeds: [
          embeds.god(
            'Pack de emotes',
            list.map((e) => `\`:${e.emoji_name}:\` → [img](${e.emoji_url})`).join('\n').slice(0, 4000)
          ),
        ],
      });
    }

    if (sub === 'jumbo') {
      const raw = interaction.options.getString('emoji');
      const m = raw.match(/<(a)?:(\w+):(\d+)>/);
      if (m) {
        const url = `https://cdn.discordapp.com/emojis/${m[3]}.${m[1] ? 'gif' : 'png'}?size=256`;
        return interaction.reply({ embeds: [embeds.base().setTitle(m[2]).setImage(url)] });
      }
      const found = await nqn.findEmoji(interaction.client, raw.replace(/:/g, ''));
      if (found?.url || found?.customUrl) {
        return interaction.reply({
          embeds: [embeds.base().setTitle(found.name).setImage(found.url || found.customUrl)],
        });
      }
      return interaction.reply({ embeds: [embeds.error('Emoji no encontrado')], ephemeral: true });
    }

    if (sub === 'nqn') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const activo = interaction.options.getBoolean('activo');
      await db.setModuleEnabled(interaction.guild.id, 'emotes', activo);
      return interaction.reply({
        embeds: [
          embeds.success(
            'NQN',
            activo
              ? 'Activado. Escribe `:nombre_emoji:` y God lo reenvía con webhook.'
              : 'Desactivado.'
          ),
        ],
      });
    }
  },
};
