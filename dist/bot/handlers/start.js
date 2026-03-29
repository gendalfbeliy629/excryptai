"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startHandler = void 0;
const startHandler = async (ctx) => {
    await ctx.reply(`
🚀 Crypto AI Bot

Команды:
/price BTC
/ai По какой цене сегодня нужно покупать и продавать BTC?
`);
};
exports.startHandler = startHandler;
//# sourceMappingURL=start.js.map