"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerInfoHandler = registerInfoHandler;
const info_service_1 = require("../../services/info.service");
function registerInfoHandler(bot) {
    bot.command("info", async (ctx) => {
        try {
            const text = ctx.message.text.trim();
            const rawSymbol = text.split(/\s+/)[1] || "BTC";
            await ctx.reply(`Собираю справку по ${rawSymbol.toUpperCase()}...`);
            const answer = await (0, info_service_1.getAssetInfo)(rawSymbol);
            await ctx.reply(answer, {
                link_preview_options: {
                    is_disabled: true,
                },
            });
        }
        catch (error) {
            console.error("Info handler error:", error);
            await ctx.reply("❌ Не удалось собрать информацию по монете. Примеры: /info BTC или /info ETH");
        }
    });
}
//# sourceMappingURL=info.js.map