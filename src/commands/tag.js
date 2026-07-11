const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isMod } = require('../utils/permissions');
const { formatTemplate } = require('../utils/helpers');

function renderTag(content, interaction) {
  // Random lines: {random:a|b|c}
  let out = content.replace(/\{random:([^}]+)\}/gi, (_, opts) => {
    const parts = opts.split('|').map((s) => s.trim()).filter(Boolean);
    return parts[Math.floor(Math.random() * parts.length)] || '';
  });
  out = formatTemplate(out, {
    user: `${interaction.user}`,
    username: interaction.user.username,
    tag: interaction.user.tag,
    server: interaction.guild?.name || '',
    count: interaction.guild?.memberCount || '',
    channel: `${interaction.channel}`,
    id: interaction.user.id,
  });
  return out;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('tag')
    .setDescription('Tags / comandos personalizados del servidor')
    .addSubcommand((s) =>
      s
        .setName('crear')
        .setDescription('Crea un tag')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre').setRequired(true))
        .addStringOption((o) => o.setName('contenido').setDescription('Respuesta con {user} {server} {random:a|b}').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Muestra un tag')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('borrar')
        .setDescription('Borra un tag')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre').setRequired(true))
    )
    .addSubcommand((s) => s.setName('lista').setDescription('Lista tags')),
  async execute(interaction) {
    if (!db.isModuleEnabled(interaction.guild.id, 'tags')) {
      return interaction.reply({ embeds: [embeds.error('Tags desactivados')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;

    if (sub === 'crear') {
      if (!isMod(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo staff')], ephemeral: true });
      }
      const nombre = interaction.options.getString('nombre');
      const contenido = interaction.options.getString('contenido');
      db.setTag(gid, nombre, contenido, interaction.user.id);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Tag creado',
            `\`${nombre}\`\nVariables: \`{user}\` \`{username}\` \`{server}\` \`{count}\` \`{channel}\` \`{random:a|b|c}\``
          ),
        ],
      });
    }

    if (sub === 'ver') {
      const nombre = interaction.options.getString('nombre');
      const tag = db.getTag(gid, nombre);
      if (!tag) {
        return interaction.reply({ embeds: [embeds.error('Tag no existe')], ephemeral: true });
      }
      db.db.prepare('UPDATE tags SET uses = uses + 1 WHERE guild_id = ? AND name = ?').run(gid, nombre.toLowerCase());
      return interaction.reply({ content: renderTag(tag.content, interaction) });
    }

    if (sub === 'borrar') {
      if (!isMod(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo staff')], ephemeral: true });
      }
      db.deleteTag(gid, interaction.options.getString('nombre'));
      return interaction.reply({ embeds: [embeds.success('Tag borrado')] });
    }

    if (sub === 'lista') {
      const list = db.listTags(gid);
      if (!list.length) {
        return interaction.reply({ embeds: [embeds.info('Tags', 'Ninguno. Usa `/tag crear`.')] });
      }
      return interaction.reply({
        embeds: [
          embeds.god('Tags del servidor', list.map((t) => `\`${t.name}\` (${t.uses})`).join(', ')),
        ],
      });
    }
  },
  renderTag,
};
