const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Configura el AutoMod de God')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('toggle')
        .setDescription('Activa/desactiva AutoMod')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('invites')
        .setDescription('Bloquear invites de Discord')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('spam')
        .setDescription('Anti-spam')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('caps')
        .setDescription('Anti-mayúsculas')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('badword')
        .setDescription('Añade palabra prohibida')
        .addStringOption((o) => o.setName('palabra').setDescription('Palabra').setRequired(true))
    )
    .addSubcommand((s) => s.setName('status').setDescription('Ver estado')),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const cur = await db.getModuleConfig(gid, 'automod');

    if (sub === 'status') {
      return interaction.reply({
        embeds: [
          embeds.info(
            'AutoMod',
            [
              `**Módulo:** ${cur.enabled ? 'ON' : 'OFF'}`,
              `**Anti-invite:** ${cur.config.antiInvite !== false}`,
              `**Anti-spam:** ${cur.config.antiSpam !== false}`,
              `**Anti-caps:** ${!!cur.config.antiCaps}`,
              `**Bad words:** ${(cur.config.badWords || []).join(', ') || 'ninguna'}`,
            ].join('\n')
          ),
        ],
        ephemeral: true,
      });
    }
    if (sub === 'toggle') {
      const activo = interaction.options.getBoolean('activo');
      await db.setModuleEnabled(gid, 'automod', activo);
      return interaction.reply({ embeds: [embeds.success('AutoMod', activo ? 'Activado' : 'Desactivado')] });
    }
    if (sub === 'invites') {
      await db.setModuleConfig(gid, 'automod', { antiInvite: interaction.options.getBoolean('activo') });
      return interaction.reply({ embeds: [embeds.success('Anti-invites actualizado')] });
    }
    if (sub === 'spam') {
      await db.setModuleConfig(gid, 'automod', { antiSpam: interaction.options.getBoolean('activo') });
      return interaction.reply({ embeds: [embeds.success('Anti-spam actualizado')] });
    }
    if (sub === 'caps') {
      await db.setModuleConfig(gid, 'automod', { antiCaps: interaction.options.getBoolean('activo') });
      return interaction.reply({ embeds: [embeds.success('Anti-caps actualizado')] });
    }
    if (sub === 'badword') {
      const palabra = interaction.options.getString('palabra').toLowerCase();
      const list = [...(cur.config.badWords || [])];
      if (!list.includes(palabra)) list.push(palabra);
      await db.setModuleConfig(gid, 'automod', { badWords: list });
      return interaction.reply({
        embeds: [embeds.success('Bad word', `Añadida: \`${palabra}\``)],
        ephemeral: true,
      });
    }
  },
};
