import { Telegraf } from "telegraf";
import axios from "axios";
import { getCryptoPrice } from "../../services/crypto.service";

export function registerPriceHandler(bot: Telegraf) {
  bot.command("price", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const symbol = text.split(" ")[1] || "BTC";

      const data = await getCryptoPrice(symbol);

      await ctx.reply(
        `💰 ${data.name} (${data.symbol})\nЦена: $${data.price}`
      );
    } catch (error: any) {
      console.error("Price command error:", error);

      if (axios.isAxiosError(error) && error.response?.status === 429) {
        await ctx.reply(
          "⏳ API цен временно перегружен. Попробуй через минуту."
        );
        return;
      }

      await ctx.reply("❌ Не удалось получить цену. Проверь тикер, например: /price BTC");
    }
  });
}