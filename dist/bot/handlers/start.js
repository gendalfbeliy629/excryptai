"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStartHandler = registerStartHandler;
function registerStartHandler(bot) {
    bot.start(async (ctx) => {
        await ctx.reply([
            "Привет! Я crypto-AI bot 🚀",
            "",
            "Доступные команды:",
            "/buy — показывает только пары с подтвержденным сигналом BUY на горизонте 1 месяц",
            "/price BTC/USDT — цена и метрики по паре",
            "/info BTC — краткая справка по монете",
            "/ai BTC/USDT — AI-анализ пары на основе данных за 30 дней",
        ].join("\n"));
    });
}
//# sourceMappingURL=start.js.map