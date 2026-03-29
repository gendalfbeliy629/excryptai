"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandlers = registerHandlers;
const start_1 = require("./start");
const price_1 = require("./price");
const ai_1 = require("./ai");
function registerHandlers(bot) {
    bot.start((ctx) => (0, start_1.startHandler)(ctx));
    bot.on('message', (ctx) => (0, price_1.priceHandler)(ctx));
    (0, ai_1.aiHandler)(bot);
}
//# sourceMappingURL=index.js.map