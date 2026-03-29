"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceHandler = void 0;
const crypto_service_1 = require("../../services/crypto.service");
const priceHandler = async (ctx) => {
    try {
        const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
        const symbol = text.split(" ")[1] || "BTC";
        const price = await (0, crypto_service_1.getCryptoPrice)(symbol.toUpperCase());
        await ctx.reply(`💰 ${symbol.toUpperCase()} = $${price}`);
    }
    catch (error) {
        console.error(error);
        await ctx.reply("❌ Ошибка получения цены");
    }
};
exports.priceHandler = priceHandler;
//# sourceMappingURL=price.js.map