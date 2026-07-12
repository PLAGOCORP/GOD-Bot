const { PermissionFlagsBits } = require('discord.js');
const db = require('../database/db');
const logging = require('./logging');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

async function record(guildId, userId, action) {
  await db.addAntinukeAction(guildId, userId, action);
}

async function recentCount(guildId, userId, windowMs) {
  const actions = await db.getAntinukeActions(guildId, windowMs);
  return actions.filter((a) => a.user_id === userId).length;
}

async function checkAndAct(guild, executorId, action) {
  if (!await db.isModuleEnabled(guild.id, 'antinuke')) return;
  if (!executorId) return;
  if (executorId === guild.client.user.id) return;
  if (executorId === guild.ownerId) return;

  const settings = await db.getGuildSettings(guild.id);
  const threshold = settings.antinukeThreshold || 3;
  const windowMs = settings.antinukeWindowMs || 10000;

  await record(guild.id, executorId, action);
  const count = await recentCount(guild.id, executorId, windowMs);
  if (count < threshold) return;

  logger.warn(`Anti-nuke: ${executorId} en ${guild.id} → ${count}x ${action}`);

  const member = await guild.members.fetch(executorId).catch(() => null);
  if (member && member.moderatable) {
    await member.timeout(60 * 60 * 1000, `God Anti-Nuke: ${count} acciones peligrosas`).catch(() => {});
    // Strip dangerous perms by removing roles that can manage
    for (const role of member.roles.cache.values()) {
      if (role.managed || role.id === guild.id) continue;
      if (
        role.permissions.has(PermissionFlagsBits.Administrator) ||
        role.permissions.has(PermissionFlagsBits.BanMembers) ||
        role.permissions.has(PermissionFlagsBits.ManageChannels) ||
        role.permissions.has(PermissionFlagsBits.ManageRoles)
      ) {
        await member.roles.remove(role, 'Anti-Nuke lockdown').catch(() => {});
      }
    }
  }

  // Lock down @everyone send messages briefly on system channel
  try {
    await guild.roles.everyone.setPermissions(
      guild.roles.everyone.permissions.remove(PermissionFlagsBits.MentionEveryone),
      'Anti-Nuke'
    );
  } catch { /* */ }

  await logging.sendLog(guild, 'automod', {
    title: '🚨 ANTI-NUKE ACTIVADO',
    fields: [
      { name: 'Usuario', value: `<@${executorId}> (\`${executorId}\`)` },
      { name: 'Acción detectada', value: `${action} × ${count}` },
      { name: 'Medida', value: 'Timeout 1h + strip roles peligrosos' },
    ],
  });

  // DM owner
  try {
    const owner = await guild.fetchOwner();
    await owner.send({
      embeds: [
        embeds.error(
          'Anti-Nuke en tu servidor',
          `En **${guild.name}** el usuario <@${executorId}> disparó anti-nuke (\`${action}\` ×${count}). Revisa el servidor.`
        ),
      ],
    });
  } catch { /* */ }
}

async function fromAudit(guild, type, auditType) {
  try {
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 1 });
    const entry = logs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return;
    await checkAndAct(guild, entry.executor?.id, type);
  } catch { /* missing permission */ }
}

module.exports = { checkAndAct, fromAudit, record };
