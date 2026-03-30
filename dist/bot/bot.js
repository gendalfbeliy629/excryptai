"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const telegraf_1 = require("telegraf");
const env_1 = require("../config/env");
const start_1 = require("./handlers/start");
const price_1 = require("./handlers/price");
const ai_1 = require("./handlers/ai");
const buy_1 = require("./handlers/buy");
exports.bot = new telegraf_1.Telegraf(env_1.env.TELEGRAM_BOT_TOKEN);
(0, start_1.registerStartHandler)(exports.bot);
(0, price_1.registerPriceHandler)(exports.bot);
(0, ai_1.registerAIHandler)(exports.bot);
(0, buy_1.registerBuyHandler)(exports.bot);
//# sourceMappingURL=bot.js.map