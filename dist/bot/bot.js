"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bot = void 0;
const telegraf_1 = require("telegraf");
//import { HttpsProxyAgent } from "https-proxy-agent";
const env_1 = require("../config/env");
const start_1 = require("./handlers/start");
const price_1 = require("./handlers/price");
const ai_1 = require("./handlers/ai");
//const agent = new HttpsProxyAgent("http://192.168.0.199:8080");
/*
export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
  telegram: {
    agent: agent as any
  }
});
*/
exports.bot = new telegraf_1.Telegraf(env_1.config.TELEGRAM_BOT_TOKEN);
// команды
exports.bot.start(start_1.startHandler);
// ВАЖНО: с аргументами
exports.bot.hears(/^\/price (.+)/, price_1.priceHandler);
// AI (например любой текст)
exports.bot.hears(/^\/ai (.+)/, ai_1.aiHandler);
exports.bot.on('text', ai_1.aiHandler);
//# sourceMappingURL=bot.js.map