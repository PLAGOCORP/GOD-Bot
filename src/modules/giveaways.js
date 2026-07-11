const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const db = require('../database/db');
const embeds = require('../utils/embeds');
const { formatDuration } = require('../utils/helpers');
const config = require('../config');

function buildComponents(id, ended = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`giveaway_join:${id}`)
        .setLabel(ended ? 'Finalizado' : 'Participar')
        .setStyle(ButtonStyle.Success)
        .setEmoji('🎉')
        .setDisabled(ended)
    ),
  ];
}

function buildEmbed(g, clientUser) {
  return embeds
    .god('🎉 GIVEAWAY', `**Premio:** ${g.prize}`)
    .addFields(
      { name: 'Ganadores', value: `${g.winners_count || g.winnersCount || 1}`, inline: true },
      {
        name: 'Termina',
        value: `<t:${Math.floor((g.end_timestamp || g.endsAt) / 1000)}:R>`,
        inline: true,
      },
      {
        name: 'Participantes',
        value: `${(g.entrants || []).length}`,
        inline: true,
      }
    )
    .setFooter({ text: `ID: ${g.id}` });
}

async function endGiveaway(client, g) {
  const entrants = g.entrants || [];
  const winnersCount = Math.min(g.winners_count || 1, entrants.length);
  const pool = [...entrants];
  const winners = [];
  for (let i = 0; i < winnersCount; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  db.saveGiveaway({
    id: g.id,
    guild_id: g.guild_id,
    channel_id: g.channel_id,
    message_id: g.message_id,
    prize: g.prize,
    winners_count: g.winners_count,
    end_timestamp: g.end_timestamp,
    requirements_json: g.requirements || {},
    entrants_json: entrants,
    ended: 1,
    host_id: g.host_id,
  });

  const channel = await client.channels.fetch(g.channel_id).catch(() => null);
  if (!channel) return winners;

  const msg = await channel.messages.fetch(g.message_id).catch(() => null);
  const resultEmbed = embeds.god(
    '🎉 Giveaway finalizado',
    winners.length
      ? `**Premio:** ${g.prize}\n**Ganadores:** ${winners.map((w) => `<@${w}>`).join(', ')}`
      : `**Premio:** ${g.prize}\nNadie participó.`
  );

  if (msg) {
    await msg.edit({ embeds: [resultEmbed], components: buildComponents(g.id, true) }).catch(() => {});
  }
  if (winners.length) {
    await channel
      .send({
        content: `🎊 ¡Felicidades ${winners.map((w) => `<@${w}>`).join(', ')}! Ganasteis **${g.prize}**`,
      })
      .catch(() => {});
    for (const wid of winners) {
      const u = await client.users.fetch(wid).catch(() => null);
      if (u) {
        await u
          .send({ embeds: [embeds.god('¡Ganaste un giveaway!', `Premio: **${g.prize}**`)] })
          .catch(() => {});
      }
    }
  }
  return winners;
}

function startChecker(client) {
  setInterval(async () => {
    try {
      const list = db.activeGiveaways();
      const now = Date.now();
      for (const g of list) {
        if (g.end_timestamp <= now) {
          await endGiveaway(client, g);
        }
      }
    } catch (e) {
      /* silent */
    }
  }, config.giveaways.checkIntervalMs);
}

module.exports = { buildComponents, buildEmbed, endGiveaway, startChecker, formatDuration };
