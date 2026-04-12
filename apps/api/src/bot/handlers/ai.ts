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
  "INJ"
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

  const symbolMatch = prompt.match(new RegExp(`\\b(${SUPPORTED_SYMBOLS.join("|")})\\b`, "i"));

  if (symbolMatch?.[1]) {
    return parseMarketPair(symbolMatch[1].toUpperCase());
  }

  return parseMarketPair("BTC/USDT");
}

export function registerAIHandler(bot: Telegraf) {
  bot.command("ai", async (ctx) => {
    try {
      const prompt = "text" in ctx.message ? ctx.message.text.replace("/ai", "").trim() : "";
      const { baseSymbol, quoteSymbol, displayPair } = extractPairOrSymbol(prompt);
      const market = await buildMarketContext(baseSymbol, quoteSymbol);
      const userQuestion = prompt
        ? `Ответь на запрос пользователя в контексте криптотрейдинга по паре ${displayPair}: ${prompt}`
        : `Дай краткий трейдинговый разбор по паре ${displayPair} на 30 дней. Обязательно сохрани deterministic signal без изменений, объясни риски, уровни и сценарий действий.`;
      const answer = await askAI(userQuestion, market);

      await ctx.reply(answer, {
        link_preview_options: {
          is_disabled: true
        }
      });
    } catch (error) {
      console.error("AI handler error:", error);
      await ctx.reply("❌ Не удалось сделать AI-анализ. Примеры: /ai BTC, /ai BTC/USDT или /ai BTC стоит ли входить сейчас");
    }
  });
}
