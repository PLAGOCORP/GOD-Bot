const {
  SlashCommandBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');
const embeds = require('../utils/embeds');
const config = require('../config');

const CATS = [
  { label: 'General', value: 'general', emoji: '⚡', desc: 'god, ayuda, invite' },
  { label: 'Moderación', value: 'moderacion', emoji: '🛡️', desc: 'ban, kick, purge, automod' },
  { label: 'Tickets', value: 'tickets', emoji: '🎫', desc: 'panel, claim, transcript' },
  { label: 'Niveles', value: 'niveles', emoji: '📈', desc: 'rank, top, recompensas' },
  { label: 'Sorteos', value: 'sorteos', emoji: '🎉', desc: 'giveaways' },
  { label: 'Roles', value: 'roles', emoji: '🎭', desc: 'reaction/button/auto' },
  { label: 'Bienvenida', value: 'bienvenida', emoji: '👋', desc: 'welcome + verify' },
  { label: 'Economía', value: 'economia', emoji: '💰', desc: 'daily, shop, crime' },
  { label: 'Utilidades', value: 'util', emoji: '🔧', desc: 'polls, afk, tags, invites' },
];

function buildCategory(cat, client) {
  const godCmd = client.commands.get('god');
  if (godCmd?.buildCategory) return godCmd.buildCategory(cat, client);
  return embeds.god('Ayuda', 'Usa `/god setup` para empezar.');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ayuda')
    .setDescription('Menú de ayuda de God Bot')
    .addStringOption((o) =>
      o
        .setName('categoria')
        .setDescription('Filtrar')
        .addChoices(...CATS.map((c) => ({ name: `${c.emoji} ${c.label}`, value: c.value })))
    ),
  buildCategory,
  async execute(interaction, client) {
    const cat = interaction.options.getString('categoria') || 'general';
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('help_menu')
        .setPlaceholder('Explorar categorías...')
        .addOptions(
          CATS.map((c) => ({
            label: c.label,
            value: c.value,
            description: c.desc,
            emoji: c.emoji,
          }))
        )
    );

    await interaction.reply({
      embeds: [
        embeds
          .god(
            '⚡ God Bot — Ayuda',
            [
              `**${config.bot.description}**`,
              '',
              '**Comandos principales:**',
              '`/god setup` — wizard de configuración',
              '`/moderacion ban|kick|timeout|warn|purge|...`',
              '`/ticket panel` — soporte profesional',
              '`/nivel rango` · `/sorteo crear` · `/rol boton`',
              '`/bienvenida canal` · `/economia daily`',
              '`/automod status` · `/invites top` · `/tag crear`',
              '',
              'Prefijo texto: `g!` (tags y ping)',
              'Elige una categoría abajo ⬇️',
            ].join('\n')
          )
          .setThumbnail(client.user.displayAvatarURL()),
      ],
      components: [row],
    });
  },
};
