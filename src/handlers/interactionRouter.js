const { Collection, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const db = require('../database/db');
const tickets = require('../modules/tickets');
const giveawayMod = require('../modules/giveaways');
const tempvc = require('../modules/tempvc');
const apps = require('../modules/applications');
const confessions = require('../modules/confessions');
const { isMod } = require('../utils/permissions');

async function handleCommand(interaction, client) {
  const command = client.commands.get(interaction.commandName);
  if (!command) {
    return interaction.reply({
      embeds: [embeds.error('Comando no encontrado')],
      ephemeral: true,
    });
  }

  const cd = command.cooldown ?? 3;
  if (!client.cooldowns.has(command.data.name)) {
    client.cooldowns.set(command.data.name, new Collection());
  }
  const timestamps = client.cooldowns.get(command.data.name);
  const now = Date.now();
  if (timestamps.has(interaction.user.id)) {
    const expires = timestamps.get(interaction.user.id) + cd * 1000;
    if (now < expires) {
      return interaction.reply({
        embeds: [embeds.warning('Cooldown', `Espera **${((expires - now) / 1000).toFixed(1)}s**.`)],
        ephemeral: true,
      });
    }
  }
  timestamps.set(interaction.user.id, now);
  setTimeout(() => timestamps.delete(interaction.user.id), cd * 1000);

  await command.execute(interaction, client);
}

function serializeG(g) {
  return {
    id: g.id,
    guild_id: g.guild_id,
    channel_id: g.channel_id,
    message_id: g.message_id,
    prize: g.prize,
    winners_count: g.winners_count,
    end_timestamp: g.end_timestamp,
    requirements_json: g.requirements || {},
    host_id: g.host_id,
  };
}

async function handleButton(interaction, client) {
  const id = interaction.customId;

  if (id.startsWith('giveaway_join:')) {
    const gid = id.split(':')[1];
    const g = await db.getGiveaway(gid);
    if (!g || g.ended) {
      return interaction.reply({ content: 'Este giveaway ya terminó.', ephemeral: true });
    }
    // Requirements
    const req = g.requirements || {};
    if (req.minLevel) {
      const u = await db.ensureUser(interaction.guild.id, interaction.user.id);
      if ((u.level_text || 0) < req.minLevel) {
        return interaction.reply({
          content: `Necesitas nivel **${req.minLevel}** (tienes ${u.level_text || 0}).`,
          ephemeral: true,
        });
      }
    }
    if (req.roleId && !interaction.member.roles.cache.has(req.roleId)) {
      return interaction.reply({ content: `Necesitas el rol <@&${req.roleId}>.`, ephemeral: true });
    }
    if (req.minDays && interaction.member.joinedTimestamp) {
      const days = (Date.now() - interaction.member.joinedTimestamp) / 86400000;
      if (days < req.minDays) {
        return interaction.reply({
          content: `Necesitas llevar **${req.minDays}** días en el servidor (llevas ${days.toFixed(1)}).`,
          ephemeral: true,
        });
      }
    }

    let entrants = g.entrants || [];
    if (entrants.includes(interaction.user.id)) {
      entrants = entrants.filter((x) => x !== interaction.user.id);
      await db.saveGiveaway({ ...serializeG(g), entrants_json: entrants, ended: 0 });
      return interaction.reply({ content: 'Has salido del sorteo.', ephemeral: true });
    }
    entrants.push(interaction.user.id);
    await db.saveGiveaway({ ...serializeG(g), entrants_json: entrants, ended: 0 });
    try {
      const emb = giveawayMod.buildEmbed({ ...g, entrants }, client.user);
      await interaction.message.edit({ embeds: [emb], components: giveawayMod.buildComponents(gid) });
    } catch { /* */ }
    return interaction.reply({
      content: `✅ Participas en **${g.prize}** (${entrants.length}).`,
      ephemeral: true,
    });
  }

  if (id.startsWith('ticket_rate:')) {
    const [, ticketId, score] = id.split(':');
    await db.updateTicket(Number(ticketId), { rating: Number(score) });
    return interaction.reply({
      content: `¡Gracias! Valoraste el ticket #${ticketId} con **${score}/5** ⭐`,
      ephemeral: true,
    });
  }

  if (id.startsWith('poll_vote:')) {
    const [, pollId, optIdx] = id.split(':');
    const poll = await db.getPoll(pollId);
    if (!poll) return interaction.reply({ content: 'Encuesta no encontrada.', ephemeral: true });
    const options = JSON.parse(poll.options_json || '[]');
    const votes = JSON.parse(poll.votes_json || '{}');
    // one vote per user: remove from all options
    for (const k of Object.keys(votes)) {
      votes[k] = (votes[k] || []).filter((uid) => uid !== interaction.user.id);
    }
    const key = String(optIdx);
    votes[key] = votes[key] || [];
    votes[key].push(interaction.user.id);
    await db.updatePoll(pollId, { votes });
    const body = options
      .map((o, i) => `**${i + 1}.** ${o} — \`${(votes[String(i)] || []).length}\``)
      .join('\n');
    const total = Object.values(votes).reduce((a, arr) => a + (arr?.length || 0), 0);
    try {
      await interaction.message.edit({
        embeds: [
          embeds.god('📊 Encuesta', `**${poll.question}**\n\n${body}\n\nVotos: **${total}**`),
        ],
      });
    } catch { /* */ }
    return interaction.reply({
      content: `Voto registrado: **${options[Number(optIdx)]}**`,
      ephemeral: true,
    });
  }

  if (id === 'verify_quiz_start') {
    const s = await db.getGuildSettings(interaction.guild.id);
    const quiz = s.verifyQuiz;
    if (!quiz) {
      return interaction.reply({ content: 'Quiz no configurado.', ephemeral: true });
    }
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
      ActionRowBuilder,
    } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId('verify_quiz_modal')
      .setTitle('Verificación')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('answer')
            .setLabel(quiz.pregunta.slice(0, 45))
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  if (id.startsWith('trivia_ans:')) {
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
      ActionRowBuilder,
    } = require('discord.js');
    const enc = id.split(':')[1];
    const modal = new ModalBuilder()
      .setCustomId(`trivia_modal:${enc}`)
      .setTitle('Respuesta trivia')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('ans')
            .setLabel('Tu respuesta')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  if (id === 'ticket_close') return tickets.closeTicket(interaction);
  if (id === 'ticket_claim') {
    const ticket = await db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: 'No es un ticket.', ephemeral: true });
    if (ticket.claimed_by) {
      return interaction.reply({ content: `Ya reclamado por <@${ticket.claimed_by}>`, ephemeral: true });
    }
    await db.updateTicket(ticket.id, { claimed_by: interaction.user.id, status: 'claimed' });
    await interaction.reply({ content: `✋ Ticket reclamado por ${interaction.user}` });
    await interaction.message.edit({ components: tickets.ticketButtons(true) }).catch(() => {});
    return;
  }

  if (id === 'tempvc_create') {
    return interaction.showModal(tempvc.createModal());
  }

  if (id.startsWith('brole:')) {
    const row = await db.getButtonRole(id);
    if (!row) return interaction.reply({ content: 'Rol no configurado.', ephemeral: true });
    const role = interaction.guild.roles.cache.get(row.role_id);
    if (!role) return interaction.reply({ content: 'El rol ya no existe.', ephemeral: true });
    const has = interaction.member.roles.cache.has(role.id);
    if (row.mode === 'once' && has) {
      return interaction.reply({ content: 'Ya tienes este rol.', ephemeral: true });
    }
    if (row.mode === 'remove' || (has && row.mode === 'toggle')) {
      await interaction.member.roles.remove(role).catch(() => {});
      return interaction.reply({ content: `Rol ${role} quitado.`, ephemeral: true });
    }
    await interaction.member.roles.add(role).catch(() => {});
    return interaction.reply({ content: `Rol ${role} añadido.`, ephemeral: true });
  }

  if (id === 'verify_me') {
    const s = await db.getGuildSettings(interaction.guild.id);
    if (s.verifiedRole) await interaction.member.roles.add(s.verifiedRole).catch(() => {});
    if (s.unverifiedRole) await interaction.member.roles.remove(s.unverifiedRole).catch(() => {});
    return interaction.reply({
      embeds: [embeds.success('Verificado', '¡Bienvenido! Acceso concedido.')],
      ephemeral: true,
    });
  }

  if (id.startsWith('app_approve:') || id.startsWith('app_reject:')) {
    if (!await isMod(interaction.member)) {
      return interaction.reply({ content: 'Solo staff.', ephemeral: true });
    }
    const appId = id.split(':')[1];
    const approve = id.startsWith('app_approve:');
    const app = await apps.getApp(appId);
    if (!app) return interaction.reply({ content: 'Aplicación no encontrada.', ephemeral: true });
    await apps.setStatus(appId, approve ? 'approved' : 'rejected', interaction.user.id);
    if (approve) {
      const typeRow = await apps.getType(app.guild_id, app.type);
      if (typeRow?.approve_role_id) {
        const member = await interaction.guild.members.fetch(app.user_id).catch(() => null);
        if (member) await member.roles.add(typeRow.approve_role_id).catch(() => {});
      }
    }
    const user = await client.users.fetch(app.user_id).catch(() => null);
    if (user) {
      await user
        .send({
          embeds: [
            approve
              ? embeds.success('Aplicación aprobada', `Tu aplicación **${app.type}** en **${interaction.guild.name}** fue aprobada.`)
              : embeds.error('Aplicación rechazada', `Tu aplicación **${app.type}** en **${interaction.guild.name}** fue rechazada.`),
          ],
        })
        .catch(() => {});
    }
    await interaction.update({
      content: approve ? `✅ Aprobada por ${interaction.user}` : `❌ Rechazada por ${interaction.user}`,
      components: [],
    });
    return;
  }

  if (id.startsWith('confess_approve:') || id.startsWith('confess_reject:')) {
    if (!await isMod(interaction.member)) {
      return interaction.reply({ content: 'Solo staff.', ephemeral: true });
    }
    const cid = id.split(':')[1];
    const row = await confessions.get(cid);
    if (!row) return interaction.reply({ content: 'No encontrada.', ephemeral: true });
    if (id.startsWith('confess_reject:')) {
      await confessions.setStatus(cid, 'rejected', interaction.user.id, null, interaction.user.username);
      return interaction.update({ content: `Rechazada por ${interaction.user}`, components: [], embeds: [] });
    }
    const settings = await db.getGuildSettings(interaction.guild.id);
    const pub = settings.confessionChannel
      ? interaction.guild.channels.cache.get(settings.confessionChannel)
      : null;
    if (!pub) {
      return interaction.reply({ content: 'No hay canal de publicación configurado.', ephemeral: true });
    }
    const msg = await pub.send({
      embeds: [
        embeds.god(`💭 Confesión #${cid}`, row.content).setFooter({ text: 'Anónima · moderada por God' }),
      ],
    });
    await confessions.setStatus(cid, 'published', interaction.user.id, msg.id, interaction.user.username);
    return interaction.update({
      content: `Publicada por ${interaction.user}`,
      components: [],
    });
  }

  if (id.startsWith('sug_approve:') || id.startsWith('sug_deny:')) {
    if (!await isMod(interaction.member)) {
      return interaction.reply({ content: 'Solo staff.', ephemeral: true });
    }
    const sid = id.split(':')[1];
    const status = id.startsWith('sug_approve:') ? 'approved' : 'denied';
    await db.updateSuggestion(sid, { status });
    return interaction.update({
      content: status === 'approved' ? `✅ Aprobada por ${interaction.user}` : `❌ Rechazada por ${interaction.user}`,
      components: [],
    });
  }

  if (id.startsWith('setup_')) {
    const step = id.replace('setup_', '');
    if (step === 'modules') {
      const mods = Object.keys(db.DEFAULT_MODULES);
      const lines = [];
      for (const m of mods) {
        const on = await db.isModuleEnabled(interaction.guild.id, m);
        lines.push(`• **${m}**: ${on ? '✅' : '❌'}`);
      }
      const body = lines.join('\n');
      return interaction.reply({
        embeds: [embeds.god('Módulos', body)],
        ephemeral: true,
      });
    }
    if (step === 'done') {
      return interaction.reply({
        embeds: [
          embeds.success(
            'Setup listo',
            'Siguiente: `/bienvenida` `/god logs` `/ticket panel` `/starboard configurar` `/musica play`'
          ),
        ],
        ephemeral: true,
      });
    }
  }
}

async function handleSelect(interaction, client) {
  if (interaction.customId === 'ticket_category') {
    // Open modal for details then create
    const category = interaction.values[0];
    const {
      ModalBuilder,
      TextInputBuilder,
      TextInputStyle,
      ActionRowBuilder,
    } = require('discord.js');
    const modal = new ModalBuilder()
      .setCustomId(`ticket_modal:${category}`)
      .setTitle(`Ticket: ${category}`)
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('asunto')
            .setLabel('Asunto / problema')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('prioridad')
            .setLabel('Prioridad (baja/normal/alta)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setValue('normal')
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'help_menu') {
    const help = client.commands.get('ayuda');
    if (help?.buildCategory) {
      return interaction.update({ embeds: [help.buildCategory(interaction.values[0], client)] });
    }
  }

  if (interaction.customId === 'god_module_toggle') {
    const mod = interaction.values[0];
    const cur = await db.isModuleEnabled(interaction.guild.id, mod);
    await db.setModuleEnabled(interaction.guild.id, mod, !cur);
    return interaction.reply({
      embeds: [embeds.success('Módulo', `**${mod}** → ${!cur ? '✅ ON' : '❌ OFF'}`)],
      ephemeral: true,
    });
  }

  if (interaction.customId.startsWith('rolemenu:')) {
    const menuId = interaction.customId.split(':')[1];
    const menu = await db.getRoleMenu(menuId);
    if (!menu) return interaction.reply({ content: 'Menú no encontrado.', ephemeral: true });
    const options = JSON.parse(menu.options_json || '[]');
    const selected = interaction.values;
    // remove roles from this menu not selected
    for (const opt of options) {
      if (!selected.includes(opt.roleId) && interaction.member.roles.cache.has(opt.roleId)) {
        await interaction.member.roles.remove(opt.roleId).catch(() => {});
      }
    }
    for (const roleId of selected) {
      await interaction.member.roles.add(roleId).catch(() => {});
    }
    return interaction.reply({
      content: `Roles actualizados: ${selected.map((r) => `<@&${r}>`).join(', ') || 'ninguno'}`,
      ephemeral: true,
    });
  }
}

async function handleModal(interaction, client) {
  const id = interaction.customId;

  if (id.startsWith('ticket_modal:')) {
    const category = id.split(':')[1];
    const asunto = interaction.fields.getTextInputValue('asunto');
    const prioridad = interaction.fields.getTextInputValue('prioridad') || 'normal';
    await interaction.deferReply({ ephemeral: true });
    const result = await tickets.createTicketChannel(interaction, category, `[${prioridad}] ${asunto}`);
    if (result.error) return interaction.editReply({ content: result.error });
    if (result.ticketId) {
      await db.updateTicket(result.ticketId, { priority: prioridad, last_activity: Date.now() });
    }
    return interaction.editReply({
      embeds: [embeds.success('Ticket creado', `${result.channel}`)],
    });
  }

  if (id === 'tempvc_modal') {
    const name = interaction.fields.getTextInputValue('name');
    const limitRaw = interaction.fields.getTextInputValue('limit') || '0';
    const limit = Math.min(99, Math.max(0, parseInt(limitRaw, 10) || 0));
    await interaction.deferReply({ ephemeral: true });
    try {
      const ch = await tempvc.createTempChannel(interaction, name, limit);
      return interaction.editReply({
        embeds: [embeds.success('VC temporal', `Canal: ${ch}`)],
      });
    } catch (err) {
      return interaction.editReply({ embeds: [embeds.error('TempVC', err.message)] });
    }
  }

  if (id === 'embed_modal') {
    const titulo = interaction.fields.getTextInputValue('titulo');
    const descripcion = interaction.fields.getTextInputValue('descripcion');
    const color = interaction.fields.getTextInputValue('color') || '9B59B6';
    const imagen = interaction.fields.getTextInputValue('imagen');
    const footer = interaction.fields.getTextInputValue('footer');
    const e = new EmbedBuilder()
      .setTitle(titulo)
      .setDescription(descripcion)
      .setColor(parseInt(color.replace('#', ''), 16) || 0x9b59b6)
      .setTimestamp();
    if (imagen) e.setImage(imagen);
    if (footer) e.setFooter({ text: footer });
    await interaction.channel.send({ embeds: [e] });
    return interaction.reply({ content: '✅ Embed enviado.', ephemeral: true });
  }

  if (id.startsWith('app_modal:')) {
    const type = id.split(':')[1];
    const typeRow = await apps.getType(interaction.guild.id, type);
    if (!typeRow) {
      return interaction.reply({ content: 'Tipo no existe.', ephemeral: true });
    }
    const questions = JSON.parse(typeRow.questions_json || '[]');
    const answers = {};
    for (let i = 0; i < questions.length; i++) {
      try {
        answers[questions[i]] = interaction.fields.getTextInputValue(`q${i}`);
      } catch { /* */ }
    }
    const appId = await apps.submit(interaction.guild.id, interaction.user.id, type, answers);
    await apps.postToReview(interaction.guild, appId, typeRow, interaction.user, answers);
    return interaction.reply({
      embeds: [embeds.success('Aplicación enviada', `ID #${appId}. El staff la revisará.`)],
      ephemeral: true,
    });
  }

  if (id === 'confess_modal') {
    const content = interaction.fields.getTextInputValue('content');
    const settings = await db.getGuildSettings(interaction.guild.id);
    if (!settings.confessionReviewChannel) {
      return interaction.reply({
        content: 'Confesiones no configuradas (`/confesar config`).',
        ephemeral: true,
      });
    }
    const cid = await confessions.submit(interaction.guild.id, interaction.user.id, content);
    const rev = interaction.guild.channels.cache.get(settings.confessionReviewChannel);
    if (rev) {
      await rev.send({
        embeds: [
          embeds.warning(
            `Confesión #${cid} (pendiente)`,
            `${content}\n\n_Autor oculto al público. ID staff: \`${interaction.user.id}\`_`
          ),
        ],
        components: confessions.reviewButtons(cid),
      });
    }
    return interaction.reply({
      embeds: [embeds.success('Enviada', 'Tu confesión está en revisión (anónima al público).')],
      ephemeral: true,
    });
  }

  if (id === 'verify_quiz_modal') {
    const s = await db.getGuildSettings(interaction.guild.id);
    const quiz = s.verifyQuiz;
    const ans = interaction.fields.getTextInputValue('answer').trim().toLowerCase();
    if (!quiz || ans !== String(quiz.respuesta).toLowerCase()) {
      return interaction.reply({
        embeds: [embeds.error('Incorrecto', 'Respuesta errónea. Inténtalo de nuevo.')],
        ephemeral: true,
      });
    }
    if (s.verifiedRole) await interaction.member.roles.add(s.verifiedRole).catch(() => {});
    if (s.unverifiedRole) await interaction.member.roles.remove(s.unverifiedRole).catch(() => {});
    // apply autoroles after verify
    const { config: wr } = await db.getModuleConfig(interaction.guild.id, 'welcome');
    for (const rid of wr.autoroles || []) {
      const role = interaction.guild.roles.cache.get(rid);
      if (role) await interaction.member.roles.add(role).catch(() => {});
    }
    return interaction.reply({
      embeds: [embeds.success('Verificado', '¡Correcto! Acceso concedido.')],
      ephemeral: true,
    });
  }

  if (id.startsWith('trivia_modal:')) {
    const enc = id.split(':')[1];
    const expected = Buffer.from(enc, 'base64url').toString('utf8').toLowerCase();
    const ans = interaction.fields.getTextInputValue('ans').trim().toLowerCase();
    const ok = ans.includes(expected) || expected.includes(ans);
    return interaction.reply({
      embeds: [
        ok
          ? embeds.success('Trivia', `¡Correcto! (\`${expected}\`)`)
          : embeds.error('Trivia', `Incorrecto. Era algo como \`${expected}\`.`),
      ],
      ephemeral: true,
    });
  }
}

async function route(interaction, client) {
  try {
    if (interaction.isChatInputCommand()) return await handleCommand(interaction, client);
    if (interaction.isButton()) return await handleButton(interaction, client);
    if (interaction.isStringSelectMenu()) return await handleSelect(interaction, client);
    if (interaction.isModalSubmit()) return await handleModal(interaction, client);
  } catch (error) {
    logger.error('Interaction:', error);
    const payload = {
      embeds: [embeds.error('Error', `\`${error.message || 'desconocido'}\``)],
      ephemeral: true,
    };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
}

module.exports = { route };
