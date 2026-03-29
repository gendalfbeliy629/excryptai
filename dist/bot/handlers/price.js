"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPriceHandler = registerPriceHandler;
const axios_1 = __importDefault(require("axios"));
const crypto_service_1 = require("../../services/crypto.service");
function registerPriceHandler(bot) {
    bot.command("price", async (ctx) => {
        try {
            const text = ctx.message.text.trim();
            const symbol = text.split(" ")[1] || "BTC";
            const data = await (0, crypto_service_1.getCryptoPrice)(symbol);
            await ctx.reply(`💰 ${data.name} (${data.symbol})\nЦена: $${data.price}`);
        }
        catch (error) {
            console.error("Price command error:", error);
            if (axios_1.default.isAxiosError(error) && error.response?.status === 429) {
                const retryAfter = error.response.headers?.["retry-after"];
                await ctx.reply(`⏳ CoinGecko временно ограничил запросы. Попробуй позже${retryAfter ? ` (примерно через ${retryAfter} сек.)` : ""}.`);
                return;
            }
            await ctx.reply("❌ Не удалось получить цену. Пример: /price BTC");
        }
    });
}
//# sourceMappingURL=price.js.map