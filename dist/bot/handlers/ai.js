"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAIHandler = registerAIHandler;
const market_service_1 = require("../../services/market.service");
const ai_service_1 = require("../../services/ai.service");
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
function extractPairOrSymbol(prompt) {
    const pairMatch = prompt.match(/\b([A-Z0-9]{2,15})\/([A-Z0-9]{2,15})\b/i);
    if (pairMatch) {
        return (0, market_service_1.parseMarketPair)(`${pairMatch[1]}/${pairMatch[2]}`);
    }
    const symbolMatch = prompt.match(new RegExp(`\\b(${SUPPORTED_SYMBOLS.join("|")})\\b`, "i"));
    if (symbolMatch?.[1]) {
        return (0, market_service_1.parseMarketPair)(symbolMatch[1].toUpperCase());
    }
    return (0, market_service_1.parseMarketPair)("BTC/USDT");
}
function registerAIHandler(bot) {
    bot.command("ai", async (ctx) => {
        try {
            const prompt = ctx.message.text.replace("/ai", "").trim();
            const { baseSymbol, quoteSymbol, displayPair } = extractPairOrSymbol(prompt);
            const finalPrompt = prompt.length > 0
                ? prompt
                : `Сделай анализ пары ${displayPair} на горизонте 1 месяц`;
            const market = await (0, market_service_1.buildMarketContext)(baseSymbol, quoteSymbol);
            const answer = await (0, ai_service_1.askAI)(finalPrompt, market);
            await ctx.reply(answer);
        }
        catch (error) {
            console.error("AI handler error:", error);
            await ctx.reply("❌ Не удалось сделать AI-анализ. Примеры: /ai BTC или /ai BTC/USDT");
        }
    });
}
//# sourceMappingURL=ai.js.map