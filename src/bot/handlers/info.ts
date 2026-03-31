import { Telegraf } from "telegraf";
import { getAssetInfo } from "../../services/info.service";

export function registerInfoHandler(bot: Telegraf) {
  bot.command("info", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const rawSymbol = text.split(/\s+/)[1] || "BTC";

      await ctx.reply(`Собираю справку по ${rawSymbol.toUpperCase()}...`);

      const answer = await getAssetInfo(rawSymbol);
      await ctx.reply(answer, {
        link_preview_options: {
          is_disabled: true,
        },
      });
    } catch (error) {
      console.error("Info handler error:", error);
      await ctx.reply(
        "❌ Не удалось собрать информацию по монете. Примеры: /info BTC или /info ETH"
      );
    }
  });
}