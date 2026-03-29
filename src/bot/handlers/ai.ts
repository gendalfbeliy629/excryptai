import { Context } from 'telegraf';
import { askAI } from '../../services/ai.service';
import { getCryptoPrice } from '../../services/crypto.service';

export async function aiHandler(ctx: any) {
  try {
    let prompt = '';

    if (ctx.match) {
      prompt = ctx.match[1];
    } else {
      const text = ctx.message?.text || '';
      if (text.startsWith('/')) return;
      prompt = text;
    }

    if (!prompt) {
      return ctx.reply('Напиши: /ai твой вопрос');
    }

    // 🧠 определяем монету
    const match = prompt.match(/\b(BTC|ETH|SOL|XRP|BNB)\b/i);
    const symbol = match ? match[1].toUpperCase() : 'BTC';

    // 💰 получаем реальную цену
    const price = await getCryptoPrice(symbol);

    // 🤖 передаём в AI
    const response = await askAI(prompt, {
      symbol,
      price,
    });

    await ctx.reply(`🤖 ${response}`);
  } catch (e) {
    console.error(e);
    ctx.reply('Ошибка AI');
  }
}