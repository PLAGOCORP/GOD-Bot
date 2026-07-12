const {
  ChannelType,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');

async function countUserChannels(guildId, userId) {
  const snap = await require('firebase-admin').firestore().collection('tempChannels')
    .where('guild_id', '==', guildId).where('creator_id', '==', userId).count().get();
  return snap.data().count;
}

async function createTempChannel(interaction, name, userLimit) {
  const guild = interaction.guild;
  const settings = db.getGuildSettings(guild.id);
  const limit = settings.tempvcLimit || 3;
  if (await countUserChannels(guild.id, interaction.user.id) >= limit) {
    throw new Error(`Ya tienes el máximo de VCs temporales (${limit}).`);
  }

  const parent = settings.tempvcCategory || interaction.member.voice?.channel?.parentId || null;

  const channel = await guild.channels.create({
    name: name.slice(0, 90) || `VC de ${interaction.user.username}`,
    type: ChannelType.GuildVoice,
    parent: parent || undefined,
    userLimit: userLimit || 0,
    permissionOverwrites: [
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.MuteMembers,
          PermissionFlagsBits.MoveMembers,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
    reason: `Temp VC por ${interaction.user.tag}`,
  });

  await db.saveTempChannel(channel.id, guild.id, interaction.user.id);

  // Move user if in voice
  if (interaction.member.voice?.channel) {
    await interaction.member.voice.setChannel(channel).catch(() => {});
  }

  return channel;
}

async function cleanupEmpty(client) {
  const rows = await db.getAllTempChannels();
  for (const row of rows) {
    const guild = client.guilds.cache.get(row.guild_id);
    if (!guild) {
      await db.deleteTempChannel(row.channel_id);
      continue;
    }
    const ch = guild.channels.cache.get(row.channel_id);
    if (!ch) {
      await db.deleteTempChannel(row.channel_id);
      continue;
    }
    if (ch.members.filter((m) => !m.user.bot).size === 0) {
      await ch.delete('Temp VC vacío').catch(() => {});
      await db.deleteTempChannel(row.channel_id);
    }
  }
}

function panelComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('tempvc_create')
        .setLabel('Crear VC temporal')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🔊')
    ),
  ];
}

function createModal() {
  return new ModalBuilder()
    .setCustomId('tempvc_modal')
    .setTitle('Crear canal de voz temporal')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Nombre del canal')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(90)
          .setPlaceholder('Mi sala')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('limit')
          .setLabel('Límite de usuarios (0 = sin límite)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setValue('0')
          .setMaxLength(2)
      )
    );
}

module.exports = {
  createTempChannel,
  cleanupEmpty,
  panelComponents,
  createModal,
  countUserChannels,
};
