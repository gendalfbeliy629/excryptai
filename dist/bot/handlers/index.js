"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerHandlers = registerHandlers;
const start_1 = require("./start");
const price_1 = require("./price");
const ai_1 = require("./ai");
const buy_1 = require("./buy");
function registerHandlers(bot) {
    (0, start_1.registerStartHandler)(bot);
    (0, price_1.registerPriceHandler)(bot);
    (0, ai_1.registerAIHandler)(bot);
    (0, buy_1.registerBuyHandler)(bot);
}
//# sourceMappingURL=index.js.map