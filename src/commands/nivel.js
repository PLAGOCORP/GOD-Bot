const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const leveling = require('../modules/leveling');
const { levelFromXp, progressBar, formatNumber } = require('../utils/helpers');
const { isAdmin } = require('../utils/permissions');
const { rankCard } = require('../utils/canvas');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nivel')
    .setDescription('Sistema de niveles y XP')
    .addSubcommand((s) =>
      s
        .setName('rango')
        .setDescription('Tu nivel / rank card')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) =>
      s
        .setName('top')
        .setDescription('Leaderboard de XP')
        .addIntegerOption((o) => o.setName('limite').setDescription('1-20').setMinValue(1).setMaxValue(20))
    )
    .addSubcommand((s) =>
      s
        .setName('config')
        .setDescription('Canal de anuncios de level-up')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('recompensa')
        .setDescription('Rol al alcanzar un nivel')
        .addIntegerOption((o) => o.setName('nivel').setDescription('Nivel').setRequired(true).setMinValue(1))
        .addRoleOption((o) => o.setName('rol').setDescription('Rol recompensa').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('no_xp_canal')
        .setDescription('Añade/quita canal sin XP')
        .addChannelOption((o) =>
          o.setName('canal').setDescription('Canal').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('no_xp_rol')
        .setDescription('Añade rol que no gana XP')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('multiplicador')
        .setDescription('Multiplicador de XP por rol')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
        .addNumberOption((o) =>
          o.setName('mult').setDescription('Ej: 1.5').setRequired(true).setMinValue(0.1).setMaxValue(5)
        )
    ),
  async execute(interaction) {
    if (!db.isModuleEnabled(interaction.guild.id, 'leveling')) {
      return interaction.reply({ embeds: [embeds.error('Módulo niveles desactivado')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'rango') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      const p = db.ensureUser(interaction.guild.id, user.id);
      const info = levelFromXp(p.xp_text);
      const rank = leveling.rankOf(interaction.guild.id, user.id);
      let files = [];
      try {
        const png = await rankCard({
          username: user.username,
          level: info.level,
          currentXp: info.currentXp,
          needed: info.needed,
          rank,
        });
        files = [new AttachmentBuilder(png, { name: 'rank.png' })];
      } catch { /* */ }
      return interaction.reply({
        embeds: [
          embeds
            .god(`📈 Rank de ${user.username}`, null)
            .setThumbnail(user.displayAvatarURL())
            .setImage(files.length ? 'attachment://rank.png' : null)
            .addFields(
              { name: 'Nivel', value: `**${info.level}**`, inline: true },
              { name: 'Posición', value: rank ? `#${rank}` : '—', inline: true },
              { name: 'Mensajes', value: formatNumber(p.messages_count), inline: true },
              { name: 'XP voz', value: formatNumber(p.xp_voice || 0), inline: true },
              {
                name: 'Progreso',
                value: `${progressBar(info.currentXp, info.needed)} ${formatNumber(info.currentXp)}/${formatNumber(info.needed)}\nTotal: ${formatNumber(p.xp_text)} XP`,
              }
            ),
        ],
        files,
      });
    }

    if (sub === 'top') {
      const limit = interaction.options.getInteger('limite') || 10;
      const board = leveling.leaderboard(interaction.guild.id, limit);
      if (!board.length) {
        return interaction.reply({ embeds: [embeds.info('Top', 'Aún no hay XP.')] });
      }
      const lines = board.map((e, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `\`#${i + 1}\``;
        const lv = levelFromXp(e.xp_text).level;
        return `${medal} <@${e.user_id}> — Nivel **${lv}** · ${formatNumber(e.xp_text)} XP`;
      });
      return interaction.reply({ embeds: [embeds.god('🏆 Top niveles', lines.join('\n'))] });
    }

    if (sub === 'config') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const ch = interaction.options.getChannel('canal');
      db.setGuildSettings(interaction.guild.id, { levelChannel: ch.id });
      return interaction.reply({ embeds: [embeds.success('Niveles', `Anuncios en ${ch}`)] });
    }

    if (sub === 'recompensa') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const nivel = interaction.options.getInteger('nivel');
      const rol = interaction.options.getRole('rol');
      const cur = db.getModuleConfig(interaction.guild.id, 'leveling');
      const rewards = { ...(cur.config.rewards || {}), [String(nivel)]: rol.id };
      db.setModuleConfig(interaction.guild.id, 'leveling', { rewards });
      return interaction.reply({ embeds: [embeds.success('Recompensa', `Nivel **${nivel}** → ${rol}`)] });
    }

    if (sub === 'no_xp_canal') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const ch = interaction.options.getChannel('canal');
      const cur = db.getModuleConfig(interaction.guild.id, 'leveling');
      let list = [...(cur.config.noXpChannels || [])];
      if (list.includes(ch.id)) list = list.filter((id) => id !== ch.id);
      else list.push(ch.id);
      db.setModuleConfig(interaction.guild.id, 'leveling', { noXpChannels: list });
      return interaction.reply({
        embeds: [embeds.success('No-XP canales', list.map((id) => `<#${id}>`).join(', ') || 'Ninguno')],
      });
    }

    if (sub === 'no_xp_rol') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const rol = interaction.options.getRole('rol');
      const cur = db.getModuleConfig(interaction.guild.id, 'leveling');
      let list = [...(cur.config.noXpRoles || [])];
      if (list.includes(rol.id)) list = list.filter((id) => id !== rol.id);
      else list.push(rol.id);
      db.setModuleConfig(interaction.guild.id, 'leveling', { noXpRoles: list });
      return interaction.reply({
        embeds: [embeds.success('No-XP roles', list.map((id) => `<@&${id}>`).join(', ') || 'Ninguno')],
      });
    }

    if (sub === 'multiplicador') {
      if (!isAdmin(interaction.member)) {
        return interaction.reply({ embeds: [embeds.error('Solo admins')], ephemeral: true });
      }
      const rol = interaction.options.getRole('rol');
      const mult = interaction.options.getNumber('mult');
      const cur = db.getModuleConfig(interaction.guild.id, 'leveling');
      const roleMultipliers = { ...(cur.config.roleMultipliers || {}), [rol.id]: mult };
      db.setModuleConfig(interaction.guild.id, 'leveling', { roleMultipliers });
      return interaction.reply({
        embeds: [embeds.success('Multiplicador', `${rol} → **x${mult}** XP`)],
      });
    }
  },
};
