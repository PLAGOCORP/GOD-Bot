/**
 * G.O.D. Bot v3 — Firestore Database Layer
 * Reemplaza SQLite completamente. Todo se persiste en Firestore.
 */
const admin = require('firebase-admin');
const { firebaseConfig } = require('../firebase/config');

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!admin.apps.length) {
    const opts = { projectId: firebaseConfig.projectId || 'godbot-d5aa2' };
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({ credential: admin.credential.cert(sa), ...opts });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp(opts);
    } else {
      throw new Error('Firebase credentials missing: set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
    }
  }
  _db = admin.firestore();
  _db.settings({ ignoreUndefinedProperties: true });
  return _db;
}

const col = (name) => getDb().collection(name);
const ref = (collection, id) => getDb().collection(collection).doc(id);

// ─── helpers ─────────────────────────────────────────────────
const jparse = (s, fb = {}) => {
  try { return s ? (typeof s === 'string' ? JSON.parse(s) : s) : structuredClone(fb); }
  catch { return structuredClone(fb); }
};
const jstr = (o) => JSON.stringify(o ?? {});
const ts = () => Date.now();

// ─── defaults ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  prefix: 'g!',
  language: 'es',
  ownerIds: '',
  welcomeChannel: null,
  leaveChannel: null,
  welcomeMessage: '¡Bienvenido {user} a **{server}**! Eres el miembro #{count}.',
  leaveMessage: '**{user}** ha abandonado **{server}**.',
  welcomeDm: false,
  logChannels: { mod: null, message: null, member: null, server: null, ticket: null },
  levelChannel: null,
  ticketCategory: null,
  ticketLog: null,
  inactiveHours: 48,
  verificationChannel: null,
  verifiedRole: null,
  unverifiedRole: null,
  modRole: null,
  staffRoles: [],
  muteRole: null,
  statsChannels: { members: null, online: null, boosts: null },
  starboardChannel: null,
  starboardEmoji: '⭐',
  starboardMin: 3,
  confessionChannel: null,
  confessionReviewChannel: null,
  suggestionChannel: null,
  birthdayChannel: null,
  birthdayRole: null,
  tempvcCategory: null,
  tempvcPanelChannel: null,
  tempvcLimit: 3,
  musicDjRole: null,
  antinukeThreshold: 3,
  antinukeWindowMs: 10000,
  antiraidThreshold: 8,
  antiraidWindowMs: 15000,
  antiraidLockMinutes: 10,
  antiraidKick: false,
  minAccountAgeHours: 0,
  kickNewAccounts: false,
  stickyRoleIds: [],
  verifyQuiz: null,
  dashboardEnabled: true,
  startingBalance: 200,
  dailyMin: 100,
  dailyMax: 500,
  workMin: 50,
  workMax: 250,
  dailyCooldown: 86_400_000,
  workCooldown: 3_600_000,
  xpMin: 15,
  xpMax: 25,
  cooldown: 60_000,
  voiceXpPerMinute: 5,
};

const DEFAULT_MODULES = {
  moderation: true, automod: true, tickets: true, leveling: true,
  giveaways: true, reaction_roles: true, welcome: true, logging: true,
  invites: true, emotes: true, economy: true, music: true,
  tags: true, antiraid: true, fun: true, starboard: true,
  birthdays: true, tempvc: true, applications: true, confessions: true,
  antinuke: true, ai: true, stats: true, suggestions: true,
};

// ─── GUILDS ──────────────────────────────────────────────────
async function ensureGuild(guildId) {
  const snap = await ref('guilds', guildId).get();
  if (snap.exists) return { guild_id: guildId, ...snap.data() };
  const data = {
    guild_id: guildId,
    language: 'es',
    prefix: 'g!',
    settings_json: DEFAULT_SETTINGS,
    created_at: ts(),
  };
  await ref('guilds', guildId).set(data, { merge: true });
  const modBatch = getDb().batch();
  for (const [mod, en] of Object.entries(DEFAULT_MODULES)) {
    modBatch.set(ref(`guilds/${guildId}/modules`, mod), { enabled: en, config: {} }, { merge: true });
  }
  await modBatch.commit();
  return data;
}

async function getGuildSettings(guildId) {
  await ensureGuild(guildId);
  const snap = await ref('guilds', guildId).get();
  const data = snap.data() || {};
  const raw = data.settings_json || {};
  const settings = typeof raw === 'string' ? jparse(raw, {}) : raw;
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    prefix: settings.prefix ?? data.prefix ?? DEFAULT_SETTINGS.prefix,
    language: settings.language ?? data.language ?? DEFAULT_SETTINGS.language,
    ownerIds: settings.ownerIds ?? data.ownerIds ?? DEFAULT_SETTINGS.ownerIds,
    logChannels: { ...DEFAULT_SETTINGS.logChannels, ...(settings.logChannels || {}) },
  };
}

async function setGuildSettings(guildId, patch) {
  await ensureGuild(guildId);
  const cur = await getGuildSettings(guildId);
  const normalized = { ...patch };
  if (normalized.ownerIds !== undefined) {
    const { parseOwnerIds } = require('../utils/permissions');
    normalized.ownerIds = parseOwnerIds(normalized.ownerIds).join(',');
  }
  const next = {
    ...cur,
    ...normalized,
    logChannels: { ...cur.logChannels, ...(normalized.logChannels || {}) },
  };
  await ref('guilds', guildId).set({ settings_json: next }, { merge: true });
  return next;
}

async function isModuleEnabled(guildId, module) {
  await ensureGuild(guildId);
  const snap = await ref(`guilds/${guildId}/modules`, module).get();
  if (!snap.exists) return DEFAULT_MODULES[module] !== false;
  return !!snap.data()?.enabled;
}

async function setModuleEnabled(guildId, module, enabled) {
  await ensureGuild(guildId);
  await ref(`guilds/${guildId}/modules`, module).set({ enabled }, { merge: true });
}

async function getModuleConfig(guildId, module) {
  await ensureGuild(guildId);
  const snap = await ref(`guilds/${guildId}/modules`, module).get();
  const data = snap.data() || {};
  return {
    enabled: snap.exists ? !!data.enabled : DEFAULT_MODULES[module] !== false,
    config: typeof data.config === 'string' ? jparse(data.config, {}) : (data.config || {}),
  };
}

async function setModuleConfig(guildId, module, configPatch, enabled) {
  await ensureGuild(guildId);
  const cur = await getModuleConfig(guildId, module);
  const config = { ...cur.config, ...configPatch };
  const patch = { config };
  if (enabled !== undefined) patch.enabled = !!enabled;
  else patch.enabled = cur.enabled;
  await ref(`guilds/${guildId}/modules`, module).set(patch, { merge: true });
  return { enabled: patch.enabled, config };
}

// ─── USERS ───────────────────────────────────────────────────
async function ensureUser(guildId, userId) {
  const docId = `${guildId}_${userId}`;
  const snap = await ref('users', docId).get();
  if (snap.exists) return { user_id: userId, guild_id: guildId, ...snap.data() };
  const settings = await getGuildSettings(guildId);
  const data = {
    user_id: userId, guild_id: guildId,
    xp_text: 0, xp_voice: 0, level_text: 0, level_voice: 0,
    last_xp: 0, last_voice_xp: 0, warns_count: 0, messages_count: 0,
    invites_count: 0, inviter_id: null, joined_at: ts(),
    balance: settings.startingBalance ?? 200, bank: 0, last_daily: 0, last_work: 0,
    inventory_json: {}, voice_minutes: 0,
  };
  await ref('users', docId).set(data, { merge: true });
  return data;
}

async function getUser(guildId, userId) {
  const snap = await ref('users', `${guildId}_${userId}`).get();
  return snap.exists ? { user_id: userId, guild_id: guildId, ...snap.data() } : null;
}

async function updateUser(guildId, userId, fields) {
  await ensureUser(guildId, userId);
  await ref('users', `${guildId}_${userId}`).set(fields, { merge: true });
  return { user_id: userId, guild_id: guildId, ...fields };
}

// ─── WARNS ───────────────────────────────────────────────────
async function addWarn(guildId, userId, modId, reason) {
  const docRef = col('warns').doc();
  const data = {
    id: docRef.id, user_id: userId, guild_id: guildId,
    mod_id: modId, reason: reason || 'Sin razón', timestamp: ts(), active: true,
  };
  await docRef.set(data);
  const count = (await col('warns').where('guild_id', '==', guildId)
    .where('user_id', '==', userId).where('active', '==', true).count().get()).data().count;
  await updateUser(guildId, userId, { warns_count: count });
  return { id: docRef.id, total: count };
}

async function listWarns(guildId, userId) {
  const snap = await col('warns')
    .where('guild_id', '==', guildId).where('user_id', '==', userId)
    .where('active', '==', true).orderBy('timestamp', 'desc').get();
  return snap.docs.map((d) => d.data());
}

async function clearWarns(guildId, userId) {
  const batch = getDb().batch();
  const snap = await col('warns').where('guild_id', '==', guildId)
    .where('user_id', '==', userId).where('active', '==', true).get();
  snap.forEach((d) => batch.update(d.ref, { active: false }));
  await batch.commit();
  await updateUser(guildId, userId, { warns_count: 0 });
}

async function removeWarn(guildId, warnId) {
  const snap = await col('warns').where('id', '==', warnId)
    .where('guild_id', '==', guildId).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data();
  await doc.ref.update({ active: false });
  const count = (await col('warns').where('guild_id', '==', guildId)
    .where('user_id', '==', data.user_id).where('active', '==', true).count().get()).data().count;
  await updateUser(guildId, data.user_id, { warns_count: count });
  return data;
}

// ─── LOGS ────────────────────────────────────────────────────
async function insertLog(guildId, type, { userId, targetId, details } = {}) {
  const docRef = col('logs').doc();
  await docRef.set({
    id: docRef.id, guild_id: guildId, type,
    user_id: userId || null, target_id: targetId || null,
    details_json: details || {}, timestamp: ts(),
  });
}

async function recentLogs(guildId, limit = 20, type = null) {
  let q = col('logs').where('guild_id', '==', guildId).orderBy('timestamp', 'desc').limit(limit);
  if (type) q = q.where('type', '==', type);
  const snap = await q.get();
  return snap.docs.map((d) => d.data());
}

// ─── GIVEAWAYS ───────────────────────────────────────────────
async function saveGiveaway(g) {
  const data = {
    id: g.id, guild_id: g.guild_id, channel_id: g.channel_id,
    message_id: g.message_id, prize: g.prize, winners_count: g.winners_count || 1,
    end_timestamp: g.end_timestamp,
    requirements: typeof g.requirements_json === 'string' ? jparse(g.requirements_json, {}) : (g.requirements || g.requirements_json || {}),
    entrants: typeof g.entrants_json === 'string' ? jparse(g.entrants_json, []) : (g.entrants || g.entrants_json || []),
    ended: !!g.ended, host_id: g.host_id,
  };
  await ref('giveaways', g.id).set(data, { merge: true });
}

async function getGiveaway(id) {
  const snap = await ref('giveaways', id).get();
  if (!snap.exists) return null;
  const d = snap.data();
  return { ...d, requirements: d.requirements || {}, entrants: d.entrants || [], ended: !!d.ended };
}

async function activeGiveaways() {
  const snap = await col('giveaways').where('ended', '==', false).get();
  return snap.docs.map((d) => {
    const data = d.data();
    return { ...data, requirements: data.requirements || {}, entrants: data.entrants || [], ended: false };
  });
}

// ─── TICKETS ─────────────────────────────────────────────────
async function createTicket(data) {
  const docRef = col('tickets').doc();
  const ticket = {
    id: docRef.id, guild_id: data.guild_id, creator_id: data.creator_id,
    channel_id: data.channel_id, thread_id: data.thread_id,
    category: data.category || 'general', subject: data.subject,
    status: 'open', claimed_by: null, priority: 'normal',
    created_at: ts(), closed_at: null, last_activity: null,
    transcript_path: null, rating: null,
  };
  await docRef.set(ticket);
  return docRef.id;
}

async function getTicketByChannel(channelId) {
  const snap1 = await col('tickets').where('channel_id', '==', channelId)
    .orderBy('created_at', 'desc').limit(5).get();
  const t1 = snap1.docs.find(d => d.data().status !== 'closed');
  if (t1) return { id: t1.id, ...t1.data() };
  const snap2 = await col('tickets').where('thread_id', '==', channelId)
    .orderBy('created_at', 'desc').limit(5).get();
  const t2 = snap2.docs.find(d => d.data().status !== 'closed');
  if (t2) return { id: t2.id, ...t2.data() };
  return null;
}

async function updateTicket(id, fields) {
  const snap = await col('tickets').where('id', '==', id).limit(1).get();
  if (!snap.empty) await snap.docs[0].ref.set(fields, { merge: true });
}

async function getTicketById(id) {
  const snap = await ref('tickets', id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

// ─── REACTION ROLES ──────────────────────────────────────────
async function addReactionRole({ guildId, messageId, channelId, emoji, roleId, mode }) {
  const docId = `${messageId}_${Buffer.from(emoji).toString('base64')}`;
  await ref('reactionRoles', docId).set({
    guild_id: guildId, message_id: messageId, channel_id: channelId || null,
    emoji, role_id: roleId, mode: mode || 'toggle',
  }, { merge: true });
}

async function getReactionRoles(messageId) {
  const snap = await col('reactionRoles').where('message_id', '==', messageId).get();
  return snap.docs.map((d) => d.data());
}

async function addButtonRole({ guildId, messageId, channelId, customId, roleId, mode, label }) {
  await ref('buttonRoles', customId).set({
    guild_id: guildId, message_id: messageId, channel_id: channelId || null,
    custom_id: customId, role_id: roleId, mode: mode || 'toggle', label: label || null,
  }, { merge: true });
}

async function getButtonRole(customId) {
  const snap = await ref('buttonRoles', customId).get();
  return snap.exists ? snap.data() : null;
}

async function getRoleMenu(menuId) {
  const snap = await ref('roleMenus', String(menuId)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function updateRoleMenuMessage(menuId, messageId) {
  await ref('roleMenus', String(menuId)).set({ message_id: messageId }, { merge: true });
}

// ─── INVITES ─────────────────────────────────────────────────
async function upsertInvite(code, guildId, inviterId, uses) {
  await ref('invites', `${guildId}_${code}`).set({
    code, guild_id: guildId, inviter_id: inviterId, uses: uses || 0,
  }, { merge: true });
}

async function getInvites(guildId) {
  const snap = await col('invites').where('guild_id', '==', guildId).get();
  return snap.docs.map((d) => d.data());
}

async function recordJoin({ guildId, userId, inviterId, code }) {
  const docRef = col('inviteJoins').doc();
  await docRef.set({
    guild_id: guildId, user_id: userId, inviter_id: inviterId || null,
    code: code || null, joined_at: ts(), left_at: null, is_fake: false,
  });
  if (inviterId) {
    await ensureUser(guildId, inviterId);
    const user = await getUser(guildId, inviterId);
    await updateUser(guildId, inviterId, { invites_count: (user?.invites_count || 0) + 1 });
  }
}

// ─── AFK ─────────────────────────────────────────────────────
async function setAfk(guildId, userId, reason) {
  await ref('afk', `${guildId}_${userId}`).set({
    user_id: userId, guild_id: guildId, reason: reason || 'AFK', since: ts(),
  });
}

async function getAfk(guildId, userId) {
  const snap = await ref('afk', `${guildId}_${userId}`).get();
  return snap.exists ? snap.data() : null;
}

async function clearAfk(guildId, userId) {
  await ref('afk', `${guildId}_${userId}`).delete().catch(() => {});
}

// ─── TAGS ────────────────────────────────────────────────────
async function getTag(guildId, name) {
  const snap = await ref('tags', `${guildId}_${name.toLowerCase()}`).get();
  return snap.exists ? snap.data() : null;
}

async function setTag(guildId, name, content, createdBy) {
  const key = `${guildId}_${name.toLowerCase()}`;
  const snap = await ref('tags', key).get();
  const existing = snap.exists ? snap.data() : {};
  await ref('tags', key).set({
    guild_id: guildId, name: name.toLowerCase(), content,
    created_by: createdBy, uses: existing.uses || 0,
  }, { merge: true });
}

async function deleteTag(guildId, name) {
  await ref('tags', `${guildId}_${name.toLowerCase()}`).delete().catch(() => {});
}

async function listTags(guildId) {
  const snap = await col('tags').where('guild_id', '==', guildId).get();
  return snap.docs.map((d) => ({ name: d.data().name, uses: d.data().uses || 0 }));
}

async function incrementTagUses(guildId, name) {
  const key = `${guildId}_${name.toLowerCase()}`;
  await ref('tags', key).set({ uses: (admin.firestore.FieldValue.increment(1)) }, { merge: true });
}

// ─── STICKY ROLES ────────────────────────────────────────────
async function getStickyRoles(guildId, userId) {
  const snap = await ref('stickyRoles', `${guildId}_${userId}`).get();
  return snap.exists ? (snap.data().role_ids || []) : [];
}

async function setStickyRoles(guildId, userId, roleIds) {
  await ref('stickyRoles', `${guildId}_${userId}`).set({
    guild_id: guildId, user_id: userId, role_ids: roleIds,
  });
}

// ─── STARBOARD ───────────────────────────────────────────────
async function getStarboard(messageId, guildId) {
  const snap = await ref('starboard', `${guildId}_${messageId}`).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function saveStarboard(data) {
  await ref('starboard', `${data.guild_id}_${data.message_id}`).set(data, { merge: true });
}

async function deleteStarboard(messageId, guildId) {
  await ref('starboard', `${guildId}_${messageId}`).delete().catch(() => {});
}

// ─── BIRTHDAYS ───────────────────────────────────────────────
async function getBirthdays(guildId) {
  const snap = await col('birthdays').where('guild_id', '==', guildId).get();
  return snap.docs.map((d) => d.data());
}

async function setBirthday(guildId, userId, day, month) {
  await ref('birthdays', `${guildId}_${userId}`).set({
    user_id: userId, guild_id: guildId, birth_day: day, birth_month: month, last_wished: 0,
  });
}

async function removeBirthday(guildId, userId) {
  await ref('birthdays', `${guildId}_${userId}`).delete().catch(() => {});
}

async function getTodayBirthdays() {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth() + 1;
  const snap = await col('birthdays').where('birth_month', '==', month)
    .where('birth_day', '==', day).get();
  return snap.docs.map((d) => d.data());
}

async function markBirthdayWished(guildId, userId) {
  await ref('birthdays', `${guildId}_${userId}`).set({ last_wished: ts() }, { merge: true });
}

// ─── TEMP CHANNELS ───────────────────────────────────────────
async function getTempChannel(channelId) {
  const snap = await ref('tempChannels', channelId).get();
  return snap.exists ? snap.data() : null;
}

async function saveTempChannel(channelId, guildId, creatorId) {
  await ref('tempChannels', channelId).set({
    channel_id: channelId, guild_id: guildId, creator_id: creatorId, created_at: ts(),
  });
}

async function deleteTempChannel(channelId) {
  await ref('tempChannels', channelId).delete().catch(() => {});
}

async function getAllTempChannels() {
  const snap = await col('tempChannels').get();
  return snap.docs.map((d) => d.data());
}

// ─── APPLICATIONS ────────────────────────────────────────────
async function getApplicationTypes(guildId) {
  const snap = await col('applicationTypes').where('guild_id', '==', guildId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getApplication(id) {
  const snap = await ref('applications', String(id)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createApplication(data) {
  const docRef = col('applications').doc();
  await docRef.set({ id: docRef.id, ...data, created_at: ts() });
  return docRef.id;
}

async function updateApplication(id, fields) {
  await ref('applications', String(id)).set(fields, { merge: true });
}

// ─── CONFESSIONS ─────────────────────────────────────────────
async function getConfession(id) {
  const snap = await ref('confessions', String(id)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createConfession(data) {
  const docRef = col('confessions').doc();
  await docRef.set({ id: docRef.id, ...data, created_at: ts() });
  return docRef.id;
}

async function updateConfession(id, fields) {
  await ref('confessions', String(id)).set(fields, { merge: true });
}

async function listConfessions(guildId, status) {
  let q = col('confessions').where('guild_id', '==', guildId);
  if (status) q = q.where('status', '==', status);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── SUGGESTIONS ─────────────────────────────────────────────
async function getSuggestion(id) {
  const snap = await ref('suggestions', String(id)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createSuggestion(data) {
  const docRef = col('suggestions').doc();
  await docRef.set({ id: docRef.id, ...data, created_at: ts() });
  return docRef.id;
}

async function updateSuggestion(id, fields) {
  await ref('suggestions', String(id)).set(fields, { merge: true });
}

async function listSuggestions(guildId, status) {
  let q = col('suggestions').where('guild_id', '==', guildId);
  if (status) q = q.where('status', '==', status);
  const snap = await q.get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── POLLS ───────────────────────────────────────────────────
async function getPoll(id) {
  const snap = await ref('polls', String(id)).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}

async function createPoll(data) {
  const docRef = col('polls').doc();
  await docRef.set({ id: docRef.id, ...data, created_at: ts() });
  return docRef.id;
}

async function updatePoll(id, fields) {
  await ref('polls', String(id)).set(fields, { merge: true });
}

// ─── REMINDERS ───────────────────────────────────────────────
async function addReminder(userId, guildId, channelId, content, remindAt) {
  const docRef = col('reminders').doc();
  await docRef.set({
    id: docRef.id, user_id: userId, guild_id: guildId,
    channel_id: channelId, content, remind_at: remindAt,
    created_at: ts(), fired: false,
  });
  return docRef.id;
}

async function markReminderFired(id) {
  await ref('reminders', id).set({ fired: true }, { merge: true });
}

async function getPendingReminders() {
  const snap = await col('reminders')
    .where('fired', '==', false)
    .where('remind_at', '>', Date.now()).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function getReminder(userId, remindAt) {
  const snap = await col('reminders')
    .where('user_id', '==', userId)
    .where('remind_at', '==', remindAt)
    .orderBy('created_at', 'desc').limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── ROLE MENUS ──────────────────────────────────────────────
async function createRoleMenu(data) {
  const docRef = col('roleMenus').doc();
  await docRef.set({ id: docRef.id, ...data });
  return docRef.id;
}

async function getRoleMenus(guildId) {
  const snap = await col('roleMenus').where('guild_id', '==', guildId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── EMOTE PACKS ─────────────────────────────────────────────
async function getEmotePacks(guildId) {
  const snap = await col('emotePacks').where('guild_id', '==', guildId).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addEmotePack(data) {
  const docRef = col('emotePacks').doc();
  await docRef.set({ id: docRef.id, ...data });
  return docRef.id;
}

// ─── EMBED TEMPLATES ─────────────────────────────────────────
async function getEmbedTemplate(guildId, name) {
  const snap = await ref('embedTemplates', `${guildId}_${name}`).get();
  return snap.exists ? snap.data() : null;
}

async function setEmbedTemplate(guildId, name, data, createdBy) {
  await ref('embedTemplates', `${guildId}_${name}`).set({
    guild_id: guildId, name, data_json: data, created_by: createdBy,
  });
}

// ─── AI LOGS ─────────────────────────────────────────────────
async function insertAiLog(guildId, userId, query, response) {
  const docRef = col('aiLogs').doc();
  await docRef.set({ id: docRef.id, guild_id: guildId, user_id: userId, query, response, timestamp: ts() });
}

// ─── ANTINUKE ACTIONS ────────────────────────────────────────
async function addAntinukeAction(guildId, userId, action) {
  const docRef = col('antinukeActions').doc();
  await docRef.set({ id: docRef.id, guild_id: guildId, user_id: userId, action, timestamp: ts() });
}

async function getAntinukeActions(guildId, windowMs = 10000) {
  const since = Date.now() - windowMs;
  const snap = await col('antinukeActions').where('guild_id', '==', guildId)
    .where('timestamp', '>', since).get();
  return snap.docs.map((d) => d.data());
}

// ─── SERVER TEMPLATES ────────────────────────────────────────
async function getServerTemplates() {
  const snap = await col('serverTemplates').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function createServerTemplate(data) {
  const docRef = col('serverTemplates').doc();
  await docRef.set({ id: docRef.id, ...data });
  return docRef.id;
}

// ─── WEB SESSIONS ────────────────────────────────────────────
async function saveWebSession(token, data) {
  await ref('webSessions', token).set(data);
}

async function getWebSession(token) {
  const snap = await ref('webSessions', token).get();
  return snap.exists ? snap.data() : null;
}

async function deleteWebSession(token) {
  await ref('webSessions', token).delete().catch(() => {});
}

// ─── MUSIC HISTORY ───────────────────────────────────────────
async function addMusicHistory(guildId, userId, title, url) {
  const docRef = col('musicHistory').doc();
  await docRef.set({ id: docRef.id, guild_id: guildId, user_id: userId, title, url, played_at: ts() });
}

// ─── COUNTERS (for dashboard stats) ──────────────────────────
async function countDocs(collection, field, value, op = '==') {
  const snap = await col(collection).where(field, op, value).count().get();
  return snap.data().count;
}

async function countUsers(guildId) { return countDocs('users', 'guild_id', guildId); }
async function countActiveWarns(guildId) {
  return (await col('warns').where('guild_id', '==', guildId).where('active', '==', true).count().get()).data().count;
}
async function countOpenTickets(guildId) {
  return (await col('tickets').where('guild_id', '==', guildId).where('status', '!=', 'closed').count().get()).data().count;
}
async function countTags(guildId) { return countDocs('tags', 'guild_id', guildId); }
async function countPendingConfessions(guildId) {
  return (await col('confessions').where('guild_id', '==', guildId).where('status', '==', 'pending').count().get()).data().count;
}
async function countPendingSuggestions(guildId) {
  return (await col('suggestions').where('guild_id', '==', guildId).where('status', '==', 'pending').count().get()).data().count;
}

// ─── EXPORTS ─────────────────────────────────────────────────
module.exports = {
  jparse, jstr, DEFAULT_SETTINGS, DEFAULT_MODULES,
  ensureGuild, getGuildSettings, setGuildSettings,
  isModuleEnabled, setModuleEnabled, getModuleConfig, setModuleConfig,
  ensureUser, getUser, updateUser,
  addWarn, listWarns, clearWarns, removeWarn,
  insertLog, recentLogs,
  saveGiveaway, getGiveaway, activeGiveaways,
  createTicket, getTicketByChannel, updateTicket, getTicketById,
  addReactionRole, getReactionRoles,
  addButtonRole, getButtonRole,
  getRoleMenu, updateRoleMenuMessage, createRoleMenu, getRoleMenus,
  upsertInvite, getInvites, recordJoin,
  setAfk, getAfk, clearAfk,
  getTag, setTag, deleteTag, listTags, incrementTagUses,
  getStickyRoles, setStickyRoles,
  getStarboard, saveStarboard, deleteStarboard,
  getBirthdays, setBirthday, removeBirthday, getTodayBirthdays, markBirthdayWished,
  getTempChannel, saveTempChannel, deleteTempChannel, getAllTempChannels,
  getApplicationTypes, getApplication, createApplication, updateApplication,
  getConfession, createConfession, updateConfession, listConfessions,
  getSuggestion, createSuggestion, updateSuggestion, listSuggestions,
  getPoll, createPoll, updatePoll,
  addReminder, markReminderFired, getPendingReminders, getReminder,
  getEmotePacks, addEmotePack,
  getEmbedTemplate, setEmbedTemplate,
  insertAiLog, addAntinukeAction, getAntinukeActions,
  getServerTemplates, createServerTemplate,
  saveWebSession, getWebSession, deleteWebSession,
  addMusicHistory,
  countUsers, countActiveWarns, countOpenTickets, countTags,
  countPendingConfessions, countPendingSuggestions,
};
