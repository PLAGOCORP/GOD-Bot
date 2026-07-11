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

function createType(guildId, type, title, description, reviewChannelId, approveRoleId, questions) {
  db.db
    .prepare(
      `INSERT INTO application_types (guild_id, type, title, description, questions_json, review_channel_id, approve_role_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(guild_id, type) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         questions_json = excluded.questions_json,
         review_channel_id = excluded.review_channel_id,
         approve_role_id = excluded.approve_role_id`
    )
    .run(
      guildId,
      type.toLowerCase(),
      title,
      description || '',
      JSON.stringify(questions || ['¿Por qué te postulas?', 'Experiencia', 'Disponibilidad']),
      reviewChannelId || null,
      approveRoleId || null
    );
}

function getType(guildId, type) {
  return db.db
    .prepare('SELECT * FROM application_types WHERE guild_id = ? AND type = ?')
    .get(guildId, type.toLowerCase());
}

function listTypes(guildId) {
  return db.db.prepare('SELECT * FROM application_types WHERE guild_id = ?').all(guildId);
}

function submit(guildId, userId, type, answers) {
  const info = db.db
    .prepare(
      `INSERT INTO applications (guild_id, user_id, type, status, answers_json)
       VALUES (?, ?, ?, 'pending', ?)`
    )
    .run(guildId, userId, type.toLowerCase(), JSON.stringify(answers));
  return info.lastInsertRowid;
}

function getApp(id) {
  return db.db.prepare('SELECT * FROM applications WHERE id = ?').get(id);
}

function setStatus(id, status, reviewerId) {
  db.db
    .prepare('UPDATE applications SET status = ?, reviewed_by = ? WHERE id = ?')
    .run(status, reviewerId, id);
}

function reviewButtons(appId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_approve:${appId}`)
        .setLabel('Aprobar')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`app_reject:${appId}`)
        .setLabel('Rechazar')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌')
    ),
  ];
}

function applyModal(type, questions) {
  const modal = new ModalBuilder()
    .setCustomId(`app_modal:${type}`)
    .setTitle(`Aplicación: ${type}`.slice(0, 45));
  const qs = (questions || []).slice(0, 5);
  for (let i = 0; i < qs.length; i++) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`q${i}`)
          .setLabel(String(qs[i]).slice(0, 45))
          .setStyle(i === 0 ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(1000)
      )
    );
  }
  return modal;
}

async function postToReview(guild, appId, typeRow, user, answers) {
  const ch = typeRow.review_channel_id
    ? guild.channels.cache.get(typeRow.review_channel_id)
    : null;
  if (!ch) return;
  const fields = Object.entries(answers).map(([k, v]) => ({
    name: k,
    value: String(v).slice(0, 1024),
  }));
  await ch.send({
    embeds: [
      embeds
        .god(`📋 Aplicación #${appId} · ${typeRow.title}`, `Usuario: ${user} (\`${user.id}\`)`)
        .addFields(fields.slice(0, 25)),
    ],
    components: reviewButtons(appId),
  });
}

module.exports = {
  createType,
  getType,
  listTypes,
  submit,
  getApp,
  setStatus,
  reviewButtons,
  applyModal,
  postToReview,
};
