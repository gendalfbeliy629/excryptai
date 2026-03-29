"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAIHandler = registerAIHandler;
const ai_service_1 = require("../../services/ai.service");
const crypto_service_1 = require("../../services/crypto.service");
function registerAIHandler(bot) {
    bot.command("ai", async (ctx) => {
        try {
            const prompt = ctx.message.text.replace("/ai", "").trim();
            const match = prompt.match(/\b(BTC|ETH|SOL|XRP|BNB)\b/i);
            const symbol = match ? match[1].toUpperCase() : "BTC";
            const market = await (0, crypto_service_1.getCryptoPrice)(symbol);
            const response = await (0, ai_service_1.askAI)(prompt, {
                symbol: market.symbol,
                price: market.price, // ✅ фикс
            });
            await ctx.reply(`🤖 ${response}`);
        }
        catch (e) {
            console.error(e);
            await ctx.reply("Ошибка AI");
        }
    });
}
//# sourceMappingURL=ai.js.map