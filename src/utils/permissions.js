const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const db = require('../database/db');

function parseOwnerIds(raw) {
  if (Array.isArray(raw)) return raw.map((id) => String(id).trim()).filter(Boolean);
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isGlobalOwner(userId) {
  return config.ownerIds.includes(String(userId));
}

function isOwnerInList(userId, ownerIdsRaw) {
  return parseOwnerIds(ownerIdsRaw).includes(String(userId));
}

async function isOwner(userId, guildId = null) {
  if (isGlobalOwner(userId)) return true;
  if (!guildId) return false;
  try {
    const settings = await db.getGuildSettings(guildId);
    return isOwnerInList(userId, settings.ownerIds);
  } catch {
    return false;
  }
}

async function isAdmin(member) {
  if (!member) return false;
  if (isGlobalOwner(member.id)) return true;
  try {
    const settings = await db.getGuildSettings(member.guild.id);
    if (isOwnerInList(member.id, settings.ownerIds)) return true;
  } catch {
    /* db not ready */
  }
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function isMod(member) {
  if (!member) return false;
  if (await isAdmin(member)) return true;
  if (
    member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.ManageMessages)
  )
    return true;

  try {
    const settings = await db.getGuildSettings(member.guild.id);
    if (settings.modRole && member.roles.cache.has(settings.modRole)) return true;
    if (Array.isArray(settings.staffRoles)) {
      return settings.staffRoles.some((r) => member.roles.cache.has(r));
    }
  } catch {
    /* db not ready */
  }
  return false;
}

async function canModerate(moderator, target) {
  if (!moderator || !target) return false;
  const guildId = moderator.guild?.id;
  if (await isOwner(moderator.id, guildId)) return true;
  if (moderator.id === target.id) return false;
  if (target.id === moderator.guild.ownerId) return false;
  if (await isOwner(target.id, guildId)) return false;
  return moderator.roles.highest.position > target.roles.highest.position;
}

module.exports = { isOwner, isAdmin, isMod, canModerate, parseOwnerIds, isGlobalOwner };