"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bot_1 = require("./bot/bot");
const app = (0, express_1.default)();
app.get("/", (_req, res) => {
    res.send("Crypto AI bot is running 🚀");
});
const PORT = Number(process.env.PORT) || 3000;
// 🔥 СРАЗУ открываем порт
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
});
// 🔥 бот запускаем отдельно
(async () => {
    try {
        const me = await bot_1.bot.telegram.getMe();
        console.log(`Bot authorized: @${me.username}`);
        await bot_1.bot.launch();
        console.log("Telegram bot started");
    }
    catch (error) {
        console.error("Bot error:", error);
    }
})();
process.once("SIGINT", () => bot_1.bot.stop("SIGINT"));
process.once("SIGTERM", () => bot_1.bot.stop("SIGTERM"));
//# sourceMappingURL=index.js.map