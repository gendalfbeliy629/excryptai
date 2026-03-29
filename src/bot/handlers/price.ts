import { Telegraf } from "telegraf";
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
    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Монета не найдена или ошибка API");
    }
  });
}