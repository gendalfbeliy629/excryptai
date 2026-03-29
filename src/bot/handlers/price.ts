import { Telegraf } from "telegraf";
import axios from "axios";
import { getCryptoPrice } from "../../services/crypto.service";

export function registerPriceHandler(bot: Telegraf) {
  bot.command("price", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const symbol = text.split(" ")[1] || "BTC";

      const data = await getCryptoPrice(symbol);

      await ctx.reply(`💰 ${data.name} (${data.symbol})\nЦена: $${data.price}`);
    } catch (error: any) {
      console.error("Price command error:", error);

      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = error.response.headers?.["retry-after"];
        await ctx.reply(
          `⏳ CoinGecko временно ограничил запросы. Попробуй позже${retryAfter ? ` (примерно через ${retryAfter} сек.)` : ""}.`
        );
        return;
      }

      await ctx.reply("❌ Не удалось получить цену. Пример: /price BTC");
    }
  });
}