import { Telegraf } from "telegraf";
import { buildMarketContext } from "../../services/market.service";

export function registerPriceHandler(bot: Telegraf) {
  bot.command("price", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const symbol = text.split(" ")[1] || "BTC";

      const market = await buildMarketContext(symbol);

      const lines = [
        `💰 ${market.asset.name} (${market.asset.symbol})`,
        `Цена: $${market.spot.priceUsd.toFixed(4)}`,
        `Изменение 24ч: ${market.spot.change24h?.toFixed(2) ?? "n/a"}%`,
        `High 24ч: ${market.technicals.high24h?.toFixed(4) ?? "n/a"}`,
        `Low 24ч: ${market.technicals.low24h?.toFixed(4) ?? "n/a"}`,
        `RSI(14): ${market.technicals.rsi14?.toFixed(2) ?? "n/a"}`,
        `TVL/ликвидность: ${market.liquidity.totalTvlUsd ? `$${market.liquidity.totalTvlUsd.toFixed(0)}` : "n/a"}`,
        `Social Volume: ${market.sentiment.socialVolumeTotal ?? "n/a"}`,
        `Social Dominance: ${market.sentiment.socialDominanceLatest ?? "n/a"}`,
      ];

      await ctx.reply(lines.join("\n"));
    } catch (error) {
      console.error("Price handler error:", error);
      await ctx.reply("❌ Не удалось получить market data. Пример: /price BTC");
    }
  });
}