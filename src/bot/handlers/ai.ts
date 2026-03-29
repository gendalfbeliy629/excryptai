import { Telegraf } from "telegraf";
import { askAI } from "../../services/ai.service";
import { getCryptoPrice } from "../../services/crypto.service";

export function registerAIHandler(bot: Telegraf) {
  bot.command("ai", async (ctx) => {
    try {
      const prompt = ctx.message.text.replace("/ai", "").trim();

      const match = prompt.match(/\b(BTC|ETH|SOL|XRP|BNB)\b/i);
      const symbol = match ? match[1].toUpperCase() : "BTC";

      const market = await getCryptoPrice(symbol);

      const response = await askAI(prompt, {
        symbol: market.symbol,
        price: market.price, // ✅ фикс
      });

      await ctx.reply(`🤖 ${response}`);
    } catch (e) {
      console.error(e);
      await ctx.reply("Ошибка AI");
    }
  });
}