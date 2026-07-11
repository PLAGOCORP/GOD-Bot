const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');

function submit(guildId, authorId, content) {
  const info = db.db
    .prepare(
      `INSERT INTO confessions (guild_id, author_id, content, status) VALUES (?, ?, ?, 'pending')`
    )
    .run(guildId, authorId, content);
  return info.lastInsertRowid;
}

function get(id) {
  return db.db.prepare('SELECT * FROM confessions WHERE id = ?').get(id);
}

function setStatus(id, status, modId, messageId = null) {
  db.db
    .prepare(
      'UPDATE confessions SET status = ?, approved_by = ?, published_message_id = COALESCE(?, published_message_id) WHERE id = ?'
    )
    .run(status, modId, messageId, id);
}

function confessModal() {
  return new ModalBuilder()
    .setCustomId('confess_modal')
    .setTitle('Confesión anónima')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('Tu confesión')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1500)
          .setPlaceholder('Escribe con respeto. Los mods revisan abusos.')
      )
    );
}

function reviewButtons(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`confess_approve:${id}`)
        .setLabel('Publicar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`confess_reject:${id}`)
        .setLabel('Rechazar')
        .setStyle(ButtonStyle.Danger)
    ),
  ];
}

module.exports = { submit, get, setStatus, confessModal, reviewButtons, embeds };
