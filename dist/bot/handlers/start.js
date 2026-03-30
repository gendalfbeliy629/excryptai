"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStartHandler = registerStartHandler;
function registerStartHandler(bot) {
    bot.start(async (ctx) => {
        await ctx.reply([
            "Привет! Я crypto-AI bot 🚀",
            "",
            "Доступные команды:",
            "/price BTC",
            "/price ETH",
            "/ai Сделай анализ BTC",
        ].join("\n"));
    });
}
//# sourceMappingURL=start.js.map