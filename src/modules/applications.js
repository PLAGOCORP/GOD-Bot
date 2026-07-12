const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const admin = require('firebase-admin');
const db = require('../database/db');
const embeds = require('../utils/embeds');

async function createType(guildId, type, title, description, reviewChannelId, approveRoleId, questions) {
  const docId = `${guildId}_${type.toLowerCase()}`;
  await admin.firestore().collection('applicationTypes').doc(docId).set({
    guild_id: guildId,
    type: type.toLowerCase(),
    title,
    description: description || '',
    questions_json: JSON.stringify(questions || ['¿Por qué te postulas?', 'Experiencia', 'Disponibilidad']),
    review_channel_id: reviewChannelId || null,
    approve_role_id: approveRoleId || null,
  }, { merge: true });
}

async function getType(guildId, type) {
  const snap = await admin.firestore().collection('applicationTypes')
    .where('guild_id', '==', guildId).where('type', '==', type.toLowerCase()).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function listTypes(guildId) {
  return db.getApplicationTypes(guildId);
}

async function submit(guildId, userId, type, answers) {
  return db.createApplication({
    guild_id: guildId,
    user_id: userId,
    type: type.toLowerCase(),
    status: 'pending',
    answers_json: JSON.stringify(answers),
  });
}

async function getApp(id) {
  return db.getApplication(id);
}

async function setStatus(id, status, reviewerId) {
  await db.updateApplication(id, { status, reviewed_by: reviewerId });
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
