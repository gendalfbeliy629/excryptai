import { Telegraf } from "telegraf";
import { buildMarketContext, parseMarketPair } from "../../services/market.service";

function formatPrice(value: number): string {
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  if (value >= 0.01) return value.toFixed(6);
  return value.toFixed(8);
}

export function registerPriceHandler(bot: Telegraf) {
  bot.command("price", async (ctx) => {
    try {
      const text = ctx.message.text.trim();
      const rawPair = text.split(/\s+/)[1] || "BTC/USDT";
      const { baseSymbol, quoteSymbol, displayPair } = parseMarketPair(rawPair);

      const market = await buildMarketContext(baseSymbol, quoteSymbol);

      const lines = [
        `💰 ${market.asset.name} (${market.asset.symbol})`,
        `Пара: ${displayPair}`,
        `Цена: ${formatPrice(market.spot.priceUsd)} ${market.pair.quoteSymbol}`,
        `Изменение 24ч: ${market.spot.change24h?.toFixed(2) ?? "n/a"}%`,
        `Изменение 30д: ${market.technicals.change30d?.toFixed(2) ?? "n/a"}%`,
        `Тренд 30д: ${market.technicals.trend30d}`,
        `High 30д: ${
          market.technicals.high30d !== null
            ? `${formatPrice(market.technicals.high30d)} ${market.pair.quoteSymbol}`
            : "n/a"
        }`,
        `Low 30д: ${
          market.technicals.low30d !== null
            ? `${formatPrice(market.technicals.low30d)} ${market.pair.quoteSymbol}`
            : "n/a"
        }`,
        `SMA 7: ${
          market.technicals.sma7 !== null
            ? `${formatPrice(market.technicals.sma7)} ${market.pair.quoteSymbol}`
            : "n/a"
        }`,
        `SMA 30: ${
          market.technicals.sma30 !== null
            ? `${formatPrice(market.technicals.sma30)} ${market.pair.quoteSymbol}`
            : "n/a"
        }`,
        `RSI(14): ${market.technicals.rsi14?.toFixed(2) ?? "n/a"}`,
        `TVL/ликвидность: ${
          market.liquidity.totalTvlUsd
            ? `$${market.liquidity.totalTvlUsd.toFixed(0)}`
            : "n/a"
        }`,
        `Social Volume: ${market.sentiment.socialVolumeTotal ?? "n/a"}`,
        `Social Dominance: ${market.sentiment.socialDominanceLatest ?? "n/a"}`,
      ];

      await ctx.reply(lines.join("\n"));
    } catch (error) {
      console.error("Price handler error:", error);
      await ctx.reply(
        "❌ Не удалось получить market data. Примеры: /price BTC или /price BTC/USDT"
      );
    }
  });
}