"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPriceHandler = registerPriceHandler;
const market_service_1 = require("../../services/market.service");
function registerPriceHandler(bot) {
    bot.command("price", async (ctx) => {
        try {
            const text = ctx.message.text.trim();
            const symbol = text.split(" ")[1] || "BTC";
            const market = await (0, market_service_1.buildMarketContext)(symbol);
            const lines = [
                `💰 ${market.asset.name} (${market.asset.symbol})`,
                `Цена: $${market.spot.priceUsd.toFixed(4)}`,
                `Изменение 24ч: ${market.spot.change24h?.toFixed(2) ?? "n/a"}%`,
                `Изменение 30д: ${market.technicals.change30d?.toFixed(2) ?? "n/a"}%`,
                `Тренд 30д: ${market.technicals.trend30d}`,
                `High 30д: ${market.technicals.high30d?.toFixed(4) ?? "n/a"}`,
                `Low 30д: ${market.technicals.low30d?.toFixed(4) ?? "n/a"}`,
                `SMA 7: ${market.technicals.sma7?.toFixed(4) ?? "n/a"}`,
                `SMA 30: ${market.technicals.sma30?.toFixed(4) ?? "n/a"}`,
                `RSI(14): ${market.technicals.rsi14?.toFixed(2) ?? "n/a"}`,
                `TVL/ликвидность: ${market.liquidity.totalTvlUsd
                    ? `$${market.liquidity.totalTvlUsd.toFixed(0)}`
                    : "n/a"}`,
                `Social Volume: ${market.sentiment.socialVolumeTotal ?? "n/a"}`,
                `Social Dominance: ${market.sentiment.socialDominanceLatest ?? "n/a"}`,
            ];
            await ctx.reply(lines.join("\n"));
        }
        catch (error) {
            console.error("Price handler error:", error);
            await ctx.reply("❌ Не удалось получить market data. Пример: /price BTC");
        }
    });
}
//# sourceMappingURL=price.js.map