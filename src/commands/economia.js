const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const config = require('../config');
const econ = require('../modules/economy');
const db = require('../database/db');
const { formatNumber, formatDuration, randomInt, pick } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('economia')
    .setDescription('Economía del servidor')
    .addSubcommand((s) =>
      s
        .setName('balance')
        .setDescription('Tu dinero')
        .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
    )
    .addSubcommand((s) => s.setName('daily').setDescription('Recompensa diaria'))
    .addSubcommand((s) => s.setName('work').setDescription('Trabajar'))
    .addSubcommand((s) =>
      s
        .setName('pay')
        .setDescription('Pagar a alguien')
        .addUserOption((o) => o.setName('usuario').setDescription('Destino').setRequired(true))
        .addIntegerOption((o) => o.setName('cantidad').setDescription('Monto').setRequired(true).setMinValue(1))
    )
    .addSubcommand((s) =>
      s
        .setName('deposit')
        .setDescription('Depositar en banco')
        .addStringOption((o) => o.setName('cantidad').setDescription('Número o all').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('withdraw')
        .setDescription('Retirar del banco')
        .addStringOption((o) => o.setName('cantidad').setDescription('Número o all').setRequired(true))
    )
    .addSubcommand((s) => s.setName('shop').setDescription('Ver tienda'))
    .addSubcommand((s) =>
      s
        .setName('buy')
        .setDescription('Comprar ítem')
        .addStringOption((o) =>
          o
            .setName('item')
            .setDescription('Ítem')
            .setRequired(true)
            .addChoices(...econ.SHOP.map((i) => ({ name: `${i.emoji} ${i.name}`, value: i.id })))
        )
    )
    .addSubcommand((s) => s.setName('top').setDescription('Ranking de ricos'))
    .addSubcommand((s) => s.setName('crime').setDescription('Crimen arriesgado')),
  async execute(interaction) {
    if (!await db.isModuleEnabled(interaction.guild.id, 'economy')) {
      return interaction.reply({ embeds: [embeds.error('Economía desactivada')], ephemeral: true });
    }
    const sub = interaction.options.getSubcommand();
    const gid = interaction.guild.id;
    const uid = interaction.user.id;
    const sym = config.economy.symbol;

    if (sub === 'balance') {
      const user = interaction.options.getUser('usuario') || interaction.user;
      const p = await econ.getProfile(gid, user.id);
      return interaction.reply({
        embeds: [
          embeds
            .god(`💰 ${user.username}`, null)
            .setThumbnail(user.displayAvatarURL())
            .addFields(
              { name: `${sym} Cartera`, value: formatNumber(p.balance), inline: true },
              { name: '🏦 Banco', value: formatNumber(p.bank), inline: true },
              { name: 'Total', value: formatNumber(p.balance + p.bank), inline: true }
            ),
        ],
      });
    }

    if (sub === 'daily') {
      const r = await econ.claimDaily(gid, uid);
      if (!r.ok) {
        const msg = r.locked ? 'Demasiado rápido. Espera un momento.' : `Vuelve en **${formatDuration(r.remaining)}**.`;
        return interaction.reply({
          embeds: [embeds.warning('Cooldown', msg)],
          ephemeral: true,
        });
      }
      return interaction.reply({
        embeds: [
          embeds.success(
            'Daily',
            `+**${formatNumber(r.amount)}** ${sym}\nBalance: **${formatNumber(r.balance)}**`
          ),
        ],
      });
    }

    if (sub === 'work') {
      const r = await econ.claimWork(gid, uid);
      if (!r.ok) {
        const msg = r.locked ? 'Demasiado rápido. Espera un momento.' : `En **${formatDuration(r.remaining)}**.`;
        return interaction.reply({
          embeds: [embeds.warning('Descansa', msg)],
          ephemeral: true,
        });
      }
      return interaction.reply({
        embeds: [
          embeds.success(
            'Trabajo',
            `Ganaste **${formatNumber(r.amount)}** ${sym}\nBalance: **${formatNumber(r.balance)}**`
          ),
        ],
      });
    }

    if (sub === 'pay') {
      const target = interaction.options.getUser('usuario');
      const amount = interaction.options.getInteger('cantidad');
      if (target.bot || target.id === uid) {
        return interaction.reply({ embeds: [embeds.error('Usuario inválido')], ephemeral: true });
      }
      const r = await econ.transfer(gid, uid, target.id, amount);
      if (!r.ok) {
        const msg = r.locked ? 'Demasiado rápido. Espera un momento.' : 'Fondos insuficientes';
        return interaction.reply({ embeds: [embeds.error(msg)], ephemeral: true });
      }
      return interaction.reply({
        embeds: [embeds.success('Pago', `Enviaste **${formatNumber(amount)}** ${sym} a ${target}.`)],
      });
    }

    if (sub === 'deposit' || sub === 'withdraw') {
      const raw = interaction.options.getString('cantidad');
      const p = await econ.getProfile(gid, uid);
      const fromBank = sub === 'withdraw';
      let amount = raw.toLowerCase() === 'all' ? (fromBank ? p.bank : p.balance) : parseInt(raw, 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        return interaction.reply({ embeds: [embeds.error('Cantidad inválida')], ephemeral: true });
      }
      if (fromBank) {
        if (p.bank < amount) {
          return interaction.reply({ embeds: [embeds.error('No hay tanto en el banco')], ephemeral: true });
        }
        await econ.saveMoney(gid, uid, { bank: p.bank - amount, balance: p.balance + amount });
        return interaction.reply({
          embeds: [embeds.success('Retiro', `**${formatNumber(amount)}** ${sym}`)],
        });
      }
      if (p.balance < amount) {
        return interaction.reply({ embeds: [embeds.error('No hay tanto en la cartera')], ephemeral: true });
      }
      await econ.saveMoney(gid, uid, { balance: p.balance - amount, bank: p.bank + amount });
      return interaction.reply({
        embeds: [embeds.success('Depósito', `**${formatNumber(amount)}** ${sym}`)],
      });
    }

    if (sub === 'shop') {
      const body = econ.SHOP.map(
        (i) => `${i.emoji} **${i.name}** — \`${i.id}\` · ${formatNumber(i.price)} ${sym}`
      ).join('\n');
      return interaction.reply({ embeds: [embeds.god('🛒 Tienda', body)] });
    }

    if (sub === 'buy') {
      const id = interaction.options.getString('item');
      const item = econ.SHOP.find((i) => i.id === id);
      const p = await econ.getProfile(gid, uid);
      if (p.balance < item.price) {
        return interaction.reply({ embeds: [embeds.error('Fondos insuficientes')], ephemeral: true });
      }
      const inv = { ...p.inventory, [id]: (p.inventory[id] || 0) + 1 };
      let extra = '';
      let balance = p.balance - item.price;
      if (id === 'crate') {
        const reward = randomInt(100, 2000);
        balance += reward;
        inv.crate = (inv.crate || 1) - 1;
        if (inv.crate <= 0) delete inv.crate;
        extra = `\n¡Caja abierta! +**${formatNumber(reward)}** ${sym}`;
      }
      await econ.saveMoney(gid, uid, { balance, inventory: inv });
      return interaction.reply({
        embeds: [
          embeds.success(
            'Compra',
            `${item.emoji} **${item.name}** por **${formatNumber(item.price)}** ${sym}.${extra}`
          ),
        ],
      });
    }

    if (sub === 'top') {
      const board = await econ.leaderboard(gid, 10);
      if (!board.length) {
        return interaction.reply({ embeds: [embeds.info('Top', 'Sin datos.')] });
      }
      const lines = board.map((e, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] || `\`#${i + 1}\``;
        return `${medal} <@${e.user_id}> — **${formatNumber(e.total)}** ${sym}`;
      });
      return interaction.reply({ embeds: [embeds.god('💎 Los más ricos', lines.join('\n'))] });
    }

    if (sub === 'crime') {
      const p = await econ.getProfile(gid, uid);
      if (Math.random() > 0.45) {
        const amount = randomInt(50, 400);
        await econ.saveMoney(gid, uid, { balance: p.balance + amount });
        return interaction.reply({
          embeds: [
            embeds.success(
              'Crimen exitoso',
              `Ganaste **${formatNumber(amount)}** ${sym} ${pick(['hackeando', 'robando ambrosía', 'estafando NFTs'])}.`
            ),
          ],
        });
      }
      const fine = Math.min(p.balance, randomInt(30, 200));
      await econ.saveMoney(gid, uid, { balance: p.balance - fine });
      return interaction.reply({
        embeds: [embeds.error('Te atraparon', `Multa: **${formatNumber(fine)}** ${sym}`)],
      });
    }
  },
};
