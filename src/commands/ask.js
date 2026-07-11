const { SlashCommandBuilder } = require('discord.js');
const embeds = require('../utils/embeds');
const config = require('../config');
const { truncate } = require('../utils/helpers');
const OpenAI = require('openai');

let clientAi = null;
function getAi() {
  if (!config.xai.apiKey) return null;
  if (!clientAi) {
    clientAi = new OpenAI({ apiKey: config.xai.apiKey, baseURL: config.xai.baseURL });
  }
  return clientAi;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Pregunta a God (IA Grok / xAI)')
    .addStringOption((o) =>
      o.setName('pregunta').setDescription('Tu pregunta').setRequired(true).setMaxLength(2000)
    ),
  cooldown: 8,
  async execute(interaction) {
    const ai = getAi();
    if (!ai) {
      return interaction.reply({
        embeds: [
          embeds.warning(
            'IA no configurada',
            'Añade `XAI_API_KEY` en `.env` → https://console.x.ai'
          ),
        ],
        ephemeral: true,
      });
    }
    const question = interaction.options.getString('pregunta');
    await interaction.deferReply();
    try {
      let answer = '';
      try {
        const resp = await ai.responses.create({
          model: config.xai.model,
          input: [
            {
              role: 'system',
              content:
                'Eres God, bot de Discord omnisciente y carismático. Responde en español, útil y épico pero conciso. Markdown de Discord ok.',
            },
            { role: 'user', content: question },
          ],
          max_output_tokens: 900,
        });
        answer = resp.output_text || '';
      } catch {
        const completion = await ai.chat.completions.create({
          model: config.xai.model,
          messages: [
            {
              role: 'system',
              content:
                'Eres God, bot de Discord omnisciente. Responde en español, útil y conciso.',
            },
            { role: 'user', content: question },
          ],
          max_tokens: 900,
        });
        answer = completion.choices?.[0]?.message?.content || 'Sin respuesta.';
      }
      await interaction.editReply({
        embeds: [
          embeds.god('God responde', truncate(answer || 'Sin respuesta.', 4000)).addFields({
            name: 'Pregunta',
            value: truncate(question, 1000),
          }),
        ],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [embeds.error('Error de IA', truncate(err.message, 500))],
      });
    }
  },
};
