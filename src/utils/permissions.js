const { PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const db = require('../database/db');

function isOwner(userId) {
  return config.ownerIds.includes(String(userId));
}

function isAdmin(member) {
  if (!member) return false;
  if (isOwner(member.id)) return true;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function isMod(member) {
  if (!member) return false;
  if (isOwner(member.id) || isAdmin(member)) return true;
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

function canModerate(moderator, target) {
  if (!moderator || !target) return false;
  if (isOwner(moderator.id)) return true;
  if (moderator.id === target.id) return false;
  if (target.id === moderator.guild.ownerId) return false;
  if (isOwner(target.id)) return false;
  return moderator.roles.highest.position > target.roles.highest.position;
}

module.exports = { isOwner, isAdmin, isMod, canModerate };
