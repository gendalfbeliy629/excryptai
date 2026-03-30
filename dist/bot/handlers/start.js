"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerStartHandler = registerStartHandler;
function registerStartHandler(bot) {
    bot.start(async (ctx) => {
        await ctx.reply([
            "Привет! Я crypto-AI bot 🚀",
            "",
            "Доступные команды:",
            "/price BTC/USDT — цена и метрики по паре",
            "или",
            "/price BTC - тогда будет для пары BTC/USDT",
            "/ai BTC/USDT — AI-анализ пары на основе данных за 30 дней",
            "или",
            "/ai BTC — тогда анализ будет для пары BTC/USDT",
            "/buy — top-10 кандидатов к покупке по горизонту 1 месяц",
        ].join("\n"));
    });
}
//# sourceMappingURL=start.js.map