const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const bday = require('../modules/birthdays');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('cumpleanos')
    .setDescription('Sistema de cumpleaños')
    .addSubcommand((s) =>
      s
        .setName('registrar')
        .setDescription('Registra tu cumpleaños DD/MM')
        .addStringOption((o) => o.setName('fecha').setDescription('Ej: 15/06').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('ver')
        .setDescription('Ver cumpleaños de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) => s.setName('proximos').setDescription('Próximos cumpleaños'))
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Canal y rol de cumpleaños (admin)')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal de felicitaciones').addChannelTypes(ChannelType.GuildText)
        )
        .addRoleOption((o) => o.setName('rol').setDescription('Rol temporal del día'))
    ),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    if (sub === 'registrar') {
      const parsed = bday.parseDate(interaction.options.getString('fecha'));
      if (!parsed) {
        return interaction.reply({
          embeds: [embeds.error('Fecha inválida', 'Usa DD/MM, ej: `15/06`.')],
          ephemeral: true,
        });
      }
      bday.setBirthday(interaction.guild.id, interaction.user.id, parsed.day, parsed.month);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Cumpleaños registrado',
            `**${String(parsed.day).padStart(2, '0')}/${String(parsed.month).padStart(2, '0')}**`
          ),
        ],
      });
    }
    if (sub === 'ver') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      const row = bday.getBirthday(interaction.guild.id, user.id);
      if (!row) {
        return interaction.reply({ embeds: [embeds.info('Cumpleaños', 'No registrado.')] });
      }
      return interaction.reply({
        embeds: [
          embeds.god(
            `🎂 ${user.username}`,
            `**${String(row.birth_day).padStart(2, '0')}/${String(row.birth_month).padStart(2, '0')}**`
          ),
        ],
      });
    }
    if (sub === 'proximos') {
      const list = bday.upcoming(interaction.guild.id, 10);
      if (!list.length) {
        return interaction.reply({ embeds: [embeds.info('Próximos', 'Nadie ha registrado su cumpleaños.')] });
      }
      const body = list
        .map(
          (b, i) =>
            `\`${i + 1}.\` <@${b.user_id}> — ${String(b.birth_day).padStart(2, '0')}/${String(b.birth_month).padStart(2, '0')} (en ${b.days}d)`
        )
        .join('\n');
      return interaction.reply({ embeds: [embeds.god('🎂 Próximos cumpleaños', body)] });
    }
    if (sub === 'config') {
      if (!await isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const canal = interaction.options.getChannel('canal');
      const rol = interaction.options.getRole('rol');
      const patch = {};
      if (canal) patch.birthdayChannel = canal.id;
      if (rol) patch.birthdayRole = rol.id;
      await db.setGuildSettings(interaction.guild.id, patch);
      return interaction.reply({ embeds: [embeds.success('Cumpleaños config', 'Guardado.')] });
    }
  },
};
