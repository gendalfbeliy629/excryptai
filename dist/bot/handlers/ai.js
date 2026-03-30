"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAIHandler = registerAIHandler;
const market_service_1 = require("../../services/market.service");
const ai_service_1 = require("../../services/ai.service");
const SUPPORTED_SYMBOLS = [
    "BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "TON", "TRX", "AVAX",
    "SHIB", "PEPE", "LINK", "DOT", "LTC", "BCH", "UNI", "ATOM", "NEAR",
    "APT", "ARB", "OP", "SUI", "ETC", "XLM", "FIL", "ICP", "HBAR", "INJ",
];
function registerAIHandler(bot) {
    bot.command("ai", async (ctx) => {
        try {
            const prompt = ctx.message.text.replace("/ai", "").trim() || "Сделай анализ BTC";
            const match = prompt.match(new RegExp(`\\b(${SUPPORTED_SYMBOLS.join("|")})\\b`, "i"));
            const symbol = match?.[1]?.toUpperCase() || "BTC";
            const market = await (0, market_service_1.buildMarketContext)(symbol);
            const answer = await (0, ai_service_1.askAI)(prompt, market);
            await ctx.reply(answer);
        }
        catch (error) {
            console.error("AI handler error:", error);
            await ctx.reply("❌ Не удалось сделать AI-анализ.");
        }
    });
}
//# sourceMappingURL=ai.js.map