const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const templates = require('../modules/templates');
const db = require('../database/db');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('plantilla')
    .setDescription('Plantillas de servidor completas')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('listar').setDescription('Lista plantillas disponibles'))
    .addSubcommand((s) =>
      s
        .setName('aplicar')
        .setDescription('Aplica una plantilla (crea roles y canales REALES)')
        .addStringOption((o) =>
          o
            .setName('nombre')
            .setDescription('Plantilla')
            .setRequired(true)
            .addChoices(
              { name: 'Gaming Community', value: 'gaming' },
              { name: 'Support / Helpdesk', value: 'support' },
              { name: 'Comunidad / Activismo', value: 'comunidad' },
              { name: 'Educación / Estudio', value: 'educacion' },
              { name: 'Eventos / Temporales', value: 'eventos' },
              { name: 'Social / Amigos', value: 'social' }
            )
        )
        .addBooleanOption((o) =>
          o.setName('confirmar').setDescription('Debes poner True para ejecutar').setRequired(true)
        )
    )
    .addSubcommand((s) =>
      s
        .setName('guardar')
        .setDescription('Guarda la config actual del servidor como plantilla personal')
        .addStringOption((o) => o.setName('nombre').setDescription('Nombre de plantilla').setRequired(true))
        .addStringOption((o) => o.setName('descripcion').setDescription('Descripción'))
    ),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      return interaction.reply({ embeds: [embeds.error('Solo administradores')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();

    if (sub === 'listar') {
      const list = templates.listBuiltin();
      const admin = require('firebase-admin');
      const fDb = admin.firestore();
      const customSnap = await fDb.collection('serverTemplates')
        .where('builtin', '==', false)
        .orderBy('id', 'desc')
        .limit(20)
        .get();
      const custom = customSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      let body =
        list.map((t) => `• **${t.name}** (\`${t.id}\`)\n  ${t.description}`).join('\n\n') +
        '\n\nUsa `/plantilla aplicar ... confirmar:True`';
      if (custom.length) {
        body +=
          '\n\n**Personalizadas:**\n' +
          custom.map((c) => `• **${c.name}** (db#${c.id}) — ${c.description || '—'}`).join('\n');
      }
      return interaction.reply({ embeds: [embeds.god('📋 Plantillas de servidor', body)] });
    }

    if (sub === 'guardar') {
      const name = interaction.options.getString('nombre');
      const description = interaction.options.getString('descripcion') || '';
      const settings = await db.getGuildSettings(interaction.guild.id);
      const modules = {};
      for (const m of Object.keys(db.DEFAULT_MODULES)) {
        modules[m] = await db.isModuleEnabled(interaction.guild.id, m);
      }
      const snapshot = {
        type: 'custom_settings',
        settings,
        modules,
        roles: interaction.guild.roles.cache
          .filter((r) => r.id !== interaction.guild.id && !r.managed)
          .map((r) => ({ id: r.id, name: r.name, color: r.color }))
          .slice(0, 50),
        channels: interaction.guild.channels.cache
          .map((c) => ({ id: c.id, name: c.name, type: c.type, parent: c.parentId }))
          .slice(0, 100),
        savedAt: Date.now(),
        guildId: interaction.guild.id,
      };
      await db.createServerTemplate({
        name,
        description,
        config_json: snapshot,
        created_by: interaction.user.id,
        public: false,
        builtin: false,
      });
      return interaction.reply({
        embeds: [
          embeds.success(
            'Plantilla guardada',
            `**${name}** — snapshot de settings, módulos, roles y canales (metadatos).\nLas plantillas built-in crean estructura; las personalizadas guardan config para reutilizar/exportar.`
          ),
        ],
      });
    }

    if (sub === 'aplicar') {
      if (!interaction.options.getBoolean('confirmar')) {
        return interaction.reply({
          embeds: [
            embeds.warning(
              'Confirmación',
              'Pon `confirmar: True` para aplicar (crea canales/roles reales).'
            ),
          ],
          ephemeral: true,
        });
      }
      if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [embeds.error('God necesita Administrator para aplicar plantillas.')],
          ephemeral: true,
        });
      }
      const id = interaction.options.getString('nombre');
      await interaction.reply({
        embeds: [embeds.god('Aplicando plantilla', 'Creando roles y canales…')],
      });
      try {
        await templates.apply(interaction.guild, id, interaction.channel);
        await interaction.followUp({
          embeds: [
            embeds.success(
              'Plantilla aplicada',
              'Revisa canales/roles. Sigue con `/god setup`.'
            ),
          ],
        });
      } catch (err) {
        await interaction.followUp({ embeds: [embeds.error('Error', err.message)] });
      }
    }
  },
};
