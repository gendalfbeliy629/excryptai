import { Telegraf } from "telegraf";
import { buildMarketContext, parseMarketPair } from "../../services/market.service";
import { askAI } from "../../services/ai.service";

const SUPPORTED_SYMBOLS = [
  "BTC",
  "ETH",
  "SOL",
  "XRP",
  "BNB",
  "ADA",
  "DOGE",
  "TON",
  "TRX",
  "AVAX",
  "SHIB",
  "PEPE",
  "LINK",
  "DOT",
  "LTC",
  "BCH",
  "UNI",
  "ATOM",
  "NEAR",
  "APT",
  "ARB",
  "OP",
  "SUI",
  "ETC",
  "XLM",
  "FIL",
  "ICP",
  "HBAR",
  "INJ",
];

function extractPairOrSymbol(prompt: string): {
  baseSymbol: string;
  quoteSymbol: string;
  displayPair: string;
} {
  const pairMatch = prompt.match(/\b([A-Z0-9]{2,15})\/([A-Z0-9]{2,15})\b/i);

  if (pairMatch) {
    return parseMarketPair(`${pairMatch[1]}/${pairMatch[2]}`);
  }

  const symbolMatch = prompt.match(
    new RegExp(`\\b(${SUPPORTED_SYMBOLS.join("|")})\\b`, "i")
  );

  if (symbolMatch?.[1]) {
    return parseMarketPair(symbolMatch[1].toUpperCase());
  }

  return parseMarketPair("BTC/USDT");
}

export function registerAIHandler(bot: Telegraf) {
  bot.command("ai", async (ctx) => {
    try {
      const prompt = ctx.message.text.replace("/ai", "").trim();
      const { baseSymbol, quoteSymbol, displayPair } = extractPairOrSymbol(prompt);

      const finalPrompt =
        prompt.length > 0
          ? prompt
          : `Сделай анализ пары ${displayPair} на горизонте 1 месяц`;

      const market = await buildMarketContext(baseSymbol, quoteSymbol);
      const answer = await askAI(finalPrompt, market);

      await ctx.reply(answer);
    } catch (error) {
      console.error("AI handler error:", error);
      await ctx.reply(
        "❌ Не удалось сделать AI-анализ. Примеры: /ai BTC или /ai BTC/USDT"
      );
    }
  });
}