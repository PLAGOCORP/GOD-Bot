const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const embeds = require('../utils/embeds');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rol')
    .setDescription('Reaction roles, button roles, menús y autoroles')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((s) =>
      s
        .setName('reaccion')
        .setDescription('Añade reaction role a un mensaje')
        .addStringOption((o) => o.setName('mensaje_id').setDescription('ID del mensaje').setRequired(true))
        .addStringOption((o) => o.setName('emoji').setDescription('Emoji').setRequired(true))
        .addRoleOption((o) => o.setName('rol').setDescription('Rol a dar').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Modo')
            .addChoices(
              { name: 'Toggle', value: 'toggle' },
              { name: 'Once', value: 'once' },
              { name: 'Remove', value: 'remove' },
              { name: 'Unique', value: 'unique' }
            )
        )
        .addChannelOption((o) => o.setName('canal').setDescription('Canal del mensaje'))
    )
    .addSubcommand((s) =>
      s
        .setName('boton')
        .setDescription('Crea un mensaje con button-role')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
        .addStringOption((o) => o.setName('etiqueta').setDescription('Texto del botón'))
        .addStringOption((o) =>
          o
            .setName('modo')
            .setDescription('Modo')
            .addChoices(
              { name: 'Toggle', value: 'toggle' },
              { name: 'Once', value: 'once' },
              { name: 'Remove', value: 'remove' }
            )
        )
    )
    .addSubcommand((s) =>
      s
        .setName('menu')
        .setDescription('Crea un select-menu de roles')
        .addStringOption((o) => o.setName('titulo').setDescription('Título').setRequired(true))
        .addStringOption((o) =>
          o.setName('roles').setDescription('IDs de roles separados por coma').setRequired(true)
        )
        .addIntegerOption((o) =>
          o.setName('max').setDescription('Máx seleccionables').setMinValue(1).setMaxValue(25)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('auto')
        .setDescription('Añade autorole al unirse')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
    )
    .addSubcommand((s) => s.setName('auto_clear').setDescription('Quita todos los autoroles'))
    .addSubcommand((s) => s.setName('lista').setDescription('Lista autoroles'))
    .addSubcommand((s) =>
      s
        .setName('masivo')
        .setDescription('Añade o quita un rol a varios usuarios')
        .addStringOption((o) =>
          o
            .setName('accion')
            .setDescription('Acción')
            .setRequired(true)
            .addChoices({ name: 'Agregar', value: 'add' }, { name: 'Quitar', value: 'remove' })
        )
        .addRoleOption((o) => o.setName('rol').setDescription('Rol').setRequired(true))
        .addStringOption((o) =>
          o.setName('usuarios').setDescription('IDs o menciones separados por espacio').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('sticky')
        .setDescription('Marca un rol como sticky (se re-aplica al rejoin)')
        .addRoleOption((o) => o.setName('rol').setDescription('Rol sticky').setRequired(true))
    ),
  async execute(interaction) {
    if (!await isAdmin(interaction.member) && !interaction.memberPermissions?.has('ManageRoles')) {
      return interaction.reply({ embeds: [embeds.error('Sin permisos')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'menu') {
      const titulo = interaction.options.getString('titulo');
      const max = interaction.options.getInteger('max') || 1;
      const ids = interaction.options
        .getString('roles')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 25);
      const options = [];
      for (const roleId of ids) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) continue;
        options.push({ label: role.name.slice(0, 100), value: role.id, roleId: role.id });
      }
      if (!options.length) {
        return interaction.reply({ embeds: [embeds.error('Ningún rol válido')], ephemeral: true });
      }
      const menuId = await db.createRoleMenu({
        guild_id: interaction.guild.id,
        message_id: 'pending',
        channel_id: interaction.channel.id,
        name: titulo,
        options_json: JSON.stringify(options),
        max_values: max,
      });
      const select = new StringSelectMenuBuilder()
        .setCustomId(`rolemenu:${menuId}`)
        .setPlaceholder(titulo.slice(0, 100))
        .setMinValues(0)
        .setMaxValues(Math.min(max, options.length))
        .addOptions(options.map((o) => ({ label: o.label, value: o.value })));
      const msg = await interaction.channel.send({
        embeds: [embeds.god(`🎭 ${titulo}`, 'Elige tus roles en el menú:')],
        components: [new ActionRowBuilder().addComponents(select)],
      });
      await db.updateRoleMenuMessage(menuId, msg.id);
      return interaction.reply({ embeds: [embeds.success('Menú de roles creado')], ephemeral: true });
    }

    if (sub === 'reaccion') {
      const messageId = interaction.options.getString('mensaje_id');
      const emoji = interaction.options.getString('emoji');
      const role = interaction.options.getRole('rol');
      const mode = interaction.options.getString('modo') || 'toggle';
      const channel = interaction.options.getChannel('canal') || interaction.channel;
      const msg = await channel.messages.fetch(messageId).catch(() => null);
      if (!msg) {
        return interaction.reply({ embeds: [embeds.error('Mensaje no encontrado')], ephemeral: true });
      }
      await msg.react(emoji).catch(() => {});
      await db.addReactionRole({
        guildId: interaction.guild.id,
        messageId,
        channelId: channel.id,
        emoji,
        roleId: role.id,
        mode,
      });
      return interaction.reply({
        embeds: [embeds.success('Reaction role', `${emoji} → ${role} · **${mode}**`)],
      });
    }

    if (sub === 'boton') {
      const role = interaction.options.getRole('rol');
      const label = interaction.options.getString('etiqueta') || role.name;
      const mode = interaction.options.getString('modo') || 'toggle';
      const customId = `brole:${interaction.guild.id}:${role.id}:${Date.now().toString(36)}`;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(customId).setLabel(label.slice(0, 80)).setStyle(ButtonStyle.Primary)
      );
      const msg = await interaction.channel.send({
        embeds: [embeds.god('Roles', `Pulsa para **${role.name}**.`)],
        components: [row],
      });
      await db.addButtonRole({
        guildId: interaction.guild.id,
        messageId: msg.id,
        channelId: interaction.channel.id,
        customId,
        roleId: role.id,
        mode,
        label,
      });
      return interaction.reply({ embeds: [embeds.success('Button role', `${role}`)], ephemeral: true });
    }

    if (sub === 'auto') {
      const role = interaction.options.getRole('rol');
      const cur = await db.getModuleConfig(interaction.guild.id, 'welcome');
      const autoroles = [...new Set([...(cur.config.autoroles || []), role.id])];
      await db.setModuleConfig(interaction.guild.id, 'welcome', { autoroles });
      return interaction.reply({ embeds: [embeds.success('Autorole', `${role}`)] });
    }

    if (sub === 'auto_clear') {
      await db.setModuleConfig(interaction.guild.id, 'welcome', { autoroles: [] });
      return interaction.reply({ embeds: [embeds.success('Autoroles limpiados')] });
    }

    if (sub === 'lista') {
      const cur = await db.getModuleConfig(interaction.guild.id, 'welcome');
      const roles = (cur.config.autoroles || []).map((id) => `<@&${id}>`).join(', ') || 'Ninguno';
      const s = await db.getGuildSettings(interaction.guild.id);
      const sticky = (s.stickyRoleIds || []).map((id) => `<@&${id}>`).join(', ') || 'Ninguno';
      return interaction.reply({
        embeds: [embeds.info('Roles', `Autoroles: ${roles}\nSticky: ${sticky}`)],
        ephemeral: true,
      });
    }

    if (sub === 'masivo') {
      const accion = interaction.options.getString('accion');
      const role = interaction.options.getRole('rol');
      const raw = interaction.options.getString('usuarios');
      const ids = raw.match(/\d{15,20}/g) || [];
      if (!ids.length) {
        return interaction.reply({ embeds: [embeds.error('No se detectaron IDs de usuario')], ephemeral: true });
      }
      await interaction.deferReply({ ephemeral: true });
      let ok = 0;
      let fail = 0;
      for (const id of ids.slice(0, 50)) {
        try {
          const m = await interaction.guild.members.fetch(id);
          if (accion === 'add') await m.roles.add(role);
          else await m.roles.remove(role);
          ok++;
        } catch {
          fail++;
        }
      }
      return interaction.editReply({
        embeds: [
          embeds.success(
            'Rol masivo',
            `${accion === 'add' ? 'Añadido' : 'Quitado'} ${role}\n✅ ${ok} · ❌ ${fail}`
          ),
        ],
      });
    }

    if (sub === 'sticky') {
      const role = interaction.options.getRole('rol');
      const s = await db.getGuildSettings(interaction.guild.id);
      const list = [...(s.stickyRoleIds || [])];
      if (list.includes(role.id)) {
        await db.setGuildSettings(interaction.guild.id, {
          stickyRoleIds: list.filter((id) => id !== role.id),
        });
        return interaction.reply({ embeds: [embeds.success('Sticky', `${role} ya no es sticky.`)] });
      }
      list.push(role.id);
      await db.setGuildSettings(interaction.guild.id, { stickyRoleIds: list });
      return interaction.reply({
        embeds: [embeds.success('Sticky', `${role} se re-aplicará al rejoin.`)],
      });
    }
  },
};
