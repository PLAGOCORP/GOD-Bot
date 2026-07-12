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

async function submit(guildId, authorId, content) {
  return db.createConfession({
    guild_id: guildId,
    author_id: authorId,
    content,
    status: 'pending',
  });
}

async function get(id) {
  return db.getConfession(id);
}

async function setStatus(id, status, modId, messageId = null) {
  const fields = { status, approved_by: modId };
  if (messageId) fields.published_message_id = messageId;
  await db.updateConfession(id, fields);
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
