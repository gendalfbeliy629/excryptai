"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bot_1 = require("./bot/bot");
async function main() {
    await bot_1.bot.launch();
    console.log('🤖 Bot started');
}
main();
//# sourceMappingURL=index.js.map