const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const music = require('../modules/music');
const { formatDuration } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('musica')
    .setDescription('Reproductor de música real (voz)')
    .addSubcommand((s) =>
      s
        .setName('play')
        .setDescription('Reproduce o encola una canción (URL o búsqueda YouTube)')
        .addStringOption((o) => o.setName('cancion').setDescription('Nombre o URL').setRequired(true))
    )
    .addSubcommand((s) => s.setName('skip').setDescription('Salta la canción actual'))
    .addSubcommand((s) => s.setName('stop').setDescription('Detiene y limpia la cola'))
    .addSubcommand((s) => s.setName('pause').setDescription('Pausa'))
    .addSubcommand((s) => s.setName('resume').setDescription('Reanuda'))
    .addSubcommand((s) => s.setName('queue').setDescription('Muestra la cola'))
    .addSubcommand((s) =>
      s
        .setName('loop')
        .setDescription('Activa/desactiva loop')
        .addBooleanOption((o) => o.setName('activo').setDescription('ON/OFF').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('volumen')
        .setDescription('Volumen 0-200%')
        .addIntegerOption((o) =>
          o.setName('porcentaje').setDescription('0-200').setRequired(true).setMinValue(0).setMaxValue(200)
        )
    )
    .addSubcommand((s) => s.setName('nowplaying').setDescription('Canción actual')),
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'play') {
      try {
        await interaction.deferReply();
      } catch (err) {
        console.error('Defer error:', err.message);
        return interaction.reply({
          embeds: [embeds.error('Música', 'Error en respuesta del bot')],
          ephemeral: true,
        });
      }

      try {
        const query = interaction.options.getString('cancion');
        console.log(`[MUSIC] Play: "${query}" by ${interaction.user.username}`);

        const result = await Promise.race([
          music.play(interaction.member, query, interaction.channel.id),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Búsqueda de música tardó demasiado (>10s)')), 10000)
          ),
        ]);

        const track = result.added;
        console.log(`[MUSIC] Success: "${track.title}"`);

        return await interaction.editReply({
          embeds: [
            embeds.god(
              result.position === 0 ? '▶️ Reproduciendo' : '➕ En cola',
              `**${track.title}**\nPedido por ${interaction.user}` +
                (track.duration ? `\nDuración: \`${formatDuration(track.duration * 1000)}\`` : '') +
                (result.position ? `\nPosición: **#${result.position}**` : '')
            ).setThumbnail(track.thumbnail || null),
          ],
        });
      } catch (err) {
        console.error(`[MUSIC] Error:`, err.message);
        try {
          return await interaction.editReply({
            embeds: [embeds.error('Música', err.message || 'Error desconocido en música')],
          });
        } catch (e) {
          console.error('EditReply error:', e.message);
        }
      }
    }

    if (sub === 'skip') {
      music.skip(interaction.guild.id);
      return interaction.reply({ embeds: [embeds.success('Skip', 'Canción saltada.')] });
    }
    if (sub === 'stop') {
      music.stop(interaction.guild.id);
      return interaction.reply({ embeds: [embeds.success('Stop', 'Reproducción detenida y cola vacía.')] });
    }
    if (sub === 'pause') {
      music.pause(interaction.guild.id);
      return interaction.reply({ embeds: [embeds.info('Pausa', 'Reproducción pausada.')] });
    }
    if (sub === 'resume') {
      music.resume(interaction.guild.id);
      return interaction.reply({ embeds: [embeds.success('Resume', 'Reproducción reanudada.')] });
    }
    if (sub === 'queue') {
      const q = music.queue(interaction.guild.id);
      if (!q.current && !q.queue.length) {
        return interaction.reply({ embeds: [embeds.info('Cola', 'Vacía. Usa `/musica play`.')] });
      }
      const lines = [];
      if (q.current) lines.push(`▶️ **${q.current.title}**`);
      q.queue.slice(0, 15).forEach((t, i) => lines.push(`\`${i + 1}.\` ${t.title}`));
      return interaction.reply({
        embeds: [embeds.god(`🎵 Cola${q.loop ? ' 🔁' : ''}`, lines.join('\n'))],
      });
    }
    if (sub === 'loop') {
      const on = music.setLoop(interaction.guild.id, interaction.options.getBoolean('activo'));
      return interaction.reply({ embeds: [embeds.success('Loop', on ? 'Activado' : 'Desactivado')] });
    }
    if (sub === 'volumen') {
      const p = interaction.options.getInteger('porcentaje');
      music.setVolume(interaction.guild.id, p / 100);
      return interaction.reply({ embeds: [embeds.success('Volumen', `${p}%`)] });
    }
    if (sub === 'nowplaying') {
      const q = music.queue(interaction.guild.id);
      if (!q.current) {
        return interaction.reply({ embeds: [embeds.info('NP', 'Nada sonando.')] });
      }
      return interaction.reply({
        embeds: [
          embeds.god('🎶 Now playing', `**${q.current.title}**`).setThumbnail(q.current.thumbnail || null),
        ],
      });
    }
  },
};
