import { Telegraf } from "telegraf";
import { buildMarketContext } from "../../services/market.service";
import { askAI } from "../../services/ai.service";

const SUPPORTED_SYMBOLS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "TON", "TRX", "AVAX",
  "SHIB", "PEPE", "LINK", "DOT", "LTC", "BCH", "UNI", "ATOM", "NEAR",
  "APT", "ARB", "OP", "SUI", "ETC", "XLM", "FIL", "ICP", "HBAR", "INJ",
];

export function registerAIHandler(bot: Telegraf) {
  bot.command("ai", async (ctx) => {
    try {
      const prompt = ctx.message.text.replace("/ai", "").trim() || "Сделай анализ BTC";

      const match = prompt.match(
        new RegExp(`\\b(${SUPPORTED_SYMBOLS.join("|")})\\b`, "i")
      );

      const symbol = match?.[1]?.toUpperCase() || "BTC";

      const market = await buildMarketContext(symbol);
      const answer = await askAI(prompt, market);

      await ctx.reply(answer);
    } catch (error) {
      console.error("AI handler error:", error);
      await ctx.reply("❌ Не удалось сделать AI-анализ.");
    }
  });
}