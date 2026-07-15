const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const { canModerate, isMod } = require('../utils/permissions');
const { parseDuration, formatDuration } = require('../utils/helpers');
const db = require('../database/db');
const logging = require('../modules/logging');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderacion')
    .setDescription('Herramientas de moderación avanzadas')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('ban')
        .setDescription('Banea a un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption((o) => o.setName('razon').setDescription('Razón'))
        .addIntegerOption((o) =>
          o.setName('dias_mensajes').setDescription('Borrar msgs (0-7 días)').setMinValue(0).setMaxValue(7)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('kick')
        .setDescription('Expulsa a un miembro')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption((o) => o.setName('razon').setDescription('Razón'))
    )
    .addSubcommand((s) =>
      s
        .setName('timeout')
        .setDescription('Silencia (timeout)')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption((o) => o.setName('tiempo').setDescription('Ej: 10m, 1h, 1d').setRequired(true))
        .addStringOption((o) => o.setName('razon').setDescription('Razón'))
    )
    .addSubcommand((s) =>
      s
        .setName('untimeout')
        .setDescription('Quita el timeout')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('warn')
        .setDescription('Advierte a un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
        .addStringOption((o) => o.setName('razon').setDescription('Razón').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('warnings')
        .setDescription('Lista advertencias')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('unwarn')
        .setDescription('Borra un warn por ID')
        .addIntegerOption((o) => o.setName('id').setDescription('ID del warn').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('clearwarns')
        .setDescription('Borra todos los warns de un usuario')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('purge')
        .setDescription('Borra mensajes del canal')
        .addIntegerOption((o) =>
          o.setName('cantidad').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)
        )
        .addStringOption((o) =>
          o
            .setName('filtro')
            .setDescription('Filtro')
            .addChoices(
              { name: 'Todos', value: 'all' },
              { name: 'Bots', value: 'bots' },
              { name: 'Humanos', value: 'humans' },
              { name: 'Con links', value: 'links' },
              { name: 'Con adjuntos', value: 'attachments' },
              { name: 'Con embeds', value: 'embeds' }
            )
        )
        .addUserOption((o) => o.setName('usuario').setDescription('Solo de este usuario'))
    )
    .addSubcommand((s) =>
      s
        .setName('slowmode')
        .setDescription('Modo lento del canal')
        .addIntegerOption((o) =>
          o.setName('segundos').setDescription('0-21600').setRequired(true).setMinValue(0).setMaxValue(21600)
        )
    )
    .addSubcommand((s) => s.setName('lock').setDescription('Bloquea el canal'))
    .addSubcommand((s) => s.setName('unlock').setDescription('Desbloquea el canal'))
    .addSubcommand((s) => s.setName('nuke').setDescription('Clona y borra el canal (limpia historial)')),
  async execute(interaction) {
    if (!await db.isModuleEnabled(interaction.guild.id, 'moderation')) {
      return interaction.reply({ embeds: [embeds.error('Módulo moderación desactivado')], ephemeral: true });
    }
    if (!await isMod(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Sin permisos de moderación')], ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();
    const reason = interaction.options.getString('razon') || 'Sin razón especificada';

    if (sub === 'ban') {
      const user = interaction.options.getUser('usuario');
      const days = interaction.options.getInteger('dias_mensajes') ?? 0;
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (member && (!await canModerate(interaction.member, member) || !member.bannable)) {
        return interaction.reply({ embeds: [embeds.error('No puedo banear a ese usuario')], ephemeral: true });
      }
      await interaction.guild.members.ban(user.id, {
        reason: `${interaction.user.tag}: ${reason}`,
        deleteMessageSeconds: days * 86400,
      });
      await logging.logModAction(interaction.guild, 'ban', {
        moderator: interaction.user,
        target: user,
        reason,
      });
      return interaction.reply({
        embeds: [embeds.mod('Usuario baneado', `**${user.tag}** baneado.\n**Razón:** ${reason}`)],
      });
    }

    if (sub === 'kick') {
      const user = interaction.options.getUser('usuario');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member || !await canModerate(interaction.member, member) || !member.kickable) {
        return interaction.reply({ embeds: [embeds.error('No puedo expulsar a ese usuario')], ephemeral: true });
      }
      await member.kick(`${interaction.user.tag}: ${reason}`);
      await logging.logModAction(interaction.guild, 'kick', {
        moderator: interaction.user,
        target: user,
        reason,
      });
      return interaction.reply({
        embeds: [embeds.mod('Usuario expulsado', `**${user.tag}** kickeado.\n**Razón:** ${reason}`)],
      });
    }

    if (sub === 'timeout') {
      const user = interaction.options.getUser('usuario');
      const msVal = parseDuration(interaction.options.getString('tiempo'));
      if (!msVal || msVal < 5000 || msVal > 28 * 86400000) {
        return interaction.reply({
          embeds: [embeds.error('Tiempo inválido', 'Entre 5s y 28d. Ej: `10m`, `2h`, `1d`.')],
          ephemeral: true,
        });
      }
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member || !await canModerate(interaction.member, member) || !member.moderatable) {
        return interaction.reply({ embeds: [embeds.error('No puedo silenciar a ese usuario')], ephemeral: true });
      }
      await member.timeout(msVal, `${interaction.user.tag}: ${reason}`);
      await logging.logModAction(interaction.guild, 'timeout', {
        moderator: interaction.user,
        target: user,
        reason,
        extra: `Duración: ${formatDuration(msVal)}`,
      });
      return interaction.reply({
        embeds: [
          embeds.mod(
            'Timeout',
            `**${user.tag}** silenciado **${formatDuration(msVal)}**.\n**Razón:** ${reason}`
          ),
        ],
      });
    }

    if (sub === 'untimeout') {
      const user = interaction.options.getUser('usuario');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return interaction.reply({ embeds: [embeds.error('Usuario no encontrado')], ephemeral: true });
      }
      await member.timeout(null);
      return interaction.reply({
        embeds: [embeds.success('Timeout removido', `**${user.tag}** puede hablar.`)],
      });
    }

    if (sub === 'warn') {
      const user = interaction.options.getUser('usuario');
      const { id, total } = await db.addWarn(interaction.guild.id, user.id, interaction.user.id, reason);
      await logging.logModAction(interaction.guild, 'warn', {
        moderator: interaction.user,
        target: user,
        reason,
        extra: `Warn #${id} · Total: ${total}`,
      });
      await user
        .send({
          embeds: [
            embeds.warning(
              `Advertencia en ${interaction.guild.name}`,
              `**Razón:** ${reason}\n**Mod:** ${interaction.user.tag}`
            ),
          ],
        })
        .catch(() => {});
      return interaction.reply({
        embeds: [
          embeds.warning(
            'Advertencia emitida',
            `**${user.tag}** · ID \`${id}\` · Total: **${total}**\n**Razón:** ${reason}`
          ),
        ],
      });
    }

    if (sub === 'warnings') {
      const user = interaction.options.getUser('usuario');
      const list = await db.listWarns(interaction.guild.id, user.id);
      if (!list.length) {
        return interaction.reply({ embeds: [embeds.info('Warns', `${user.tag} no tiene advertencias.`)] });
      }
      const body = list
        .map(
          (w) =>
            `**#${w.id}** — ${w.reason}\n└ <@${w.mod_id}> · <t:${Math.floor(w.timestamp / 1000)}:R>`
        )
        .join('\n');
      return interaction.reply({
        embeds: [embeds.warning(`Warns de ${user.tag}`, body.slice(0, 4000))],
      });
    }

    if (sub === 'unwarn') {
      const id = interaction.options.getInteger('id');
      const row = await db.removeWarn(interaction.guild.id, id);
      if (!row) {
        return interaction.reply({ embeds: [embeds.error('Warn no encontrado')], ephemeral: true });
      }
      return interaction.reply({ embeds: [embeds.success('Warn eliminado', `ID \`${id}\` desactivado.`)] });
    }

    if (sub === 'clearwarns') {
      const user = interaction.options.getUser('usuario');
      await db.clearWarns(interaction.guild.id, user.id);
      return interaction.reply({
        embeds: [embeds.success('Warns limpiados', `Se borraron las advertencias de ${user.tag}.`)],
      });
    }

    if (sub === 'purge') {
      const amount = interaction.options.getInteger('cantidad');
      const filtro = interaction.options.getString('filtro') || 'all';
      const onlyUser = interaction.options.getUser('usuario');
      await interaction.deferReply({ ephemeral: true });
      const fetched = await interaction.channel.messages.fetch({ limit: 100 });
      let filtered = [...fetched.values()];
      if (onlyUser) filtered = filtered.filter((m) => m.author.id === onlyUser.id);
      if (filtro === 'bots') filtered = filtered.filter((m) => m.author.bot);
      if (filtro === 'humans') filtered = filtered.filter((m) => !m.author.bot);
      if (filtro === 'links') filtered = filtered.filter((m) => /https?:\/\//i.test(m.content));
      if (filtro === 'attachments') filtered = filtered.filter((m) => m.attachments.size > 0);
      if (filtro === 'embeds') filtered = filtered.filter((m) => m.embeds.length > 0);
      filtered = filtered.slice(0, amount);
      const deleted = await interaction.channel.bulkDelete(filtered, true);
      await logging.logModAction(interaction.guild, 'purge', {
        moderator: interaction.user,
        target: onlyUser || interaction.user,
        reason: `Purge ${deleted.size} msgs · filtro ${filtro}`,
      });
      return interaction.editReply({
        embeds: [embeds.success('Purge', `Eliminados **${deleted.size}** mensajes.`)],
      });
    }

    if (sub === 'slowmode') {
      const seconds = interaction.options.getInteger('segundos');
      await interaction.channel.setRateLimitPerUser(seconds);
      return interaction.reply({
        embeds: [
          embeds.success(
            'Slowmode',
            seconds === 0 ? 'Desactivado.' : `**${seconds}s** por mensaje.`
          ),
        ],
      });
    }

    if (sub === 'lock') {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: false,
      });
      return interaction.reply({
        embeds: [embeds.warning('Canal bloqueado', `${interaction.channel} cerrado por ${interaction.user}.`)],
      });
    }

    if (sub === 'unlock') {
      await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
        SendMessages: null,
      });
      return interaction.reply({
        embeds: [embeds.success('Canal desbloqueado', `${interaction.channel} abierto.`)],
      });
    }

    if (sub === 'nuke') {
      const channel = interaction.channel;
      await interaction.reply({ embeds: [embeds.warning('Nuke', 'Clonando...')], ephemeral: true });
      const clone = await channel.clone({ reason: `Nuke por ${interaction.user.tag}` });
      await clone.setPosition(channel.position);
      await channel.delete(`Nuke por ${interaction.user.tag}`);
      await clone.send({
        embeds: [embeds.god('💣 Canal nucleado', `Reiniciado por ${interaction.user}.`)],
      });
    }
  },
};
