const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const logging = require('./logging');

const TRANSCRIPTS = path.join(__dirname, '..', '..', 'data', 'transcripts');
if (!fs.existsSync(TRANSCRIPTS)) fs.mkdirSync(TRANSCRIPTS, { recursive: true });

function panelComponents() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('ticket_category')
    .setPlaceholder('Elige una categoría...')
    .addOptions(
      { label: 'Soporte general', value: 'general', emoji: '🎫', description: 'Ayuda general' },
      { label: 'Reporte / Bug', value: 'reporte', emoji: '🐛', description: 'Reportar un problema' },
      { label: 'Sugerencia', value: 'sugerencia', emoji: '💡', description: 'Ideas para el server' },
      { label: 'Denuncia', value: 'denuncia', emoji: '🚨', description: 'Reportar un usuario' }
    );
  return [new ActionRowBuilder().addComponents(select)];
}

function ticketButtons(claimed = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel(claimed ? 'Reclamado' : 'Reclamar')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('✋')
        .setDisabled(claimed),
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Cerrar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒')
    ),
  ];
}

async function createTicketChannel(interaction, category, subject) {
  const guild = interaction.guild;
  const settings = db.getGuildSettings(guild.id);
  const name = `ticket-${interaction.user.username}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 90);

  const existing = db.db
    .prepare("SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open'")
    .get(guild.id, interaction.user.id);
  if (existing?.channel_id) {
    const ch = guild.channels.cache.get(existing.channel_id);
    if (ch) return { error: `Ya tienes un ticket abierto: ${ch}` };
  }

  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  if (settings.modRole) {
    overwrites.push({
      id: settings.modRole,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: settings.ticketCategory || undefined,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: overwrites,
  });

  const ticketId = db.createTicket({
    guild_id: guild.id,
    creator_id: interaction.user.id,
    channel_id: channel.id,
    thread_id: null,
    category: category || 'general',
    subject: subject || 'Sin asunto',
  });

  await channel.send({
    content: `${interaction.user}${settings.modRole ? ` | <@&${settings.modRole}>` : ''}`,
    embeds: [
      embeds.god(
        `🎫 Ticket #${ticketId}`,
        `**Categoría:** ${category}\n**Asunto:** ${subject || '—'}\n**Usuario:** ${interaction.user}\n\nEl staff te atenderá pronto. Usa los botones de abajo.`
      ),
    ],
    components: ticketButtons(false),
  });

  await logging.sendLog(guild, 'ticket', {
    title: 'Ticket abierto',
    user: interaction.user,
    fields: [
      { name: 'ID', value: `#${ticketId}`, inline: true },
      { name: 'Categoría', value: category, inline: true },
      { name: 'Canal', value: `${channel}`, inline: true },
    ],
  });

  return { channel, ticketId };
}

async function generateTranscript(channel, ticket) {
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) return null;

  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const rows = sorted
    .map((m) => {
      const time = new Date(m.createdTimestamp).toISOString();
      const content = (m.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const files = m.attachments.map((a) => `<a href="${a.url}">${a.name}</a>`).join(' ');
      return `<div class="msg"><span class="time">${time}</span> <strong>${m.author.tag}</strong>: ${content} ${files}</div>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>Ticket #${ticket.id}</title>
<style>
body{font-family:system-ui,sans-serif;background:#1e1e2e;color:#cdd6f4;padding:24px;max-width:900px;margin:auto}
h1{color:#f9e2af}.msg{padding:8px 0;border-bottom:1px solid #313244}.time{color:#6c7086;font-size:12px}
</style></head><body>
<h1>⚡ God — Transcript Ticket #${ticket.id}</h1>
<p>Usuario: ${ticket.creator_id} · Categoría: ${ticket.category} · Cerrado: ${new Date().toISOString()}</p>
<hr/>
${rows}
</body></html>`;

  const file = path.join(TRANSCRIPTS, `ticket-${ticket.id}-${Date.now()}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

function ratingButtons(ticketId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:5`).setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:4`).setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:3`).setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`ticket_rate:${ticketId}:1`).setLabel('⭐').setStyle(ButtonStyle.Danger)
    ),
  ];
}

async function closeTicket(interaction) {
  const ticket = db.getTicketByChannel(interaction.channel.id);
  if (!ticket) {
    return interaction.reply({ content: 'Este canal no es un ticket de God.', ephemeral: true });
  }

  await interaction.reply({ content: '🔒 Generando transcript y cerrando en 12s... Valora el soporte si puedes.' });

  const file = await generateTranscript(interaction.channel, ticket);
  db.updateTicket(ticket.id, {
    status: 'closed',
    closed_at: Date.now(),
    transcript_path: file,
  });

  // CSAT rating in channel before delete
  await interaction.channel
    .send({
      content: `<@${ticket.creator_id}> ¿Cómo fue la atención? (CSAT)`,
      components: ratingButtons(ticket.id),
    })
    .catch(() => {});

  const settings = db.getGuildSettings(interaction.guild.id);
  const logCh = settings.ticketLog
    ? interaction.guild.channels.cache.get(settings.ticketLog)
    : logging.resolveLogChannel(interaction.guild, 'ticket');

  if (logCh && file) {
    await logCh
      .send({
        embeds: [
          embeds.info(
            `Ticket #${ticket.id} cerrado`,
            `Cerrado por ${interaction.user}\nCreador: <@${ticket.creator_id}>\nStaff claim: ${ticket.claimed_by ? `<@${ticket.claimed_by}>` : '—'}`
          ),
        ],
        files: [file],
      })
      .catch(() => {});
  }

  const creator = await interaction.client.users.fetch(ticket.creator_id).catch(() => null);
  if (creator && file) {
    await creator
      .send({
        embeds: [
          embeds.god(
            'Ticket cerrado',
            `Tu ticket #${ticket.id} en **${interaction.guild.name}** fue cerrado.\nSi puedes, valora la atención en el canal del ticket antes de que se borre.`
          ),
        ],
        files: [file],
        components: ratingButtons(ticket.id),
      })
      .catch(() => {});
  }

  setTimeout(() => interaction.channel.delete().catch(() => {}), 12000);
}

module.exports = {
  panelComponents,
  ticketButtons,
  ratingButtons,
  createTicketChannel,
  closeTicket,
  generateTranscript,
};
