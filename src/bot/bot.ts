import { Telegraf } from "telegraf";
//import { HttpsProxyAgent } from "https-proxy-agent";
import { config } from "../config/env";

import { startHandler } from './handlers/start';
import { priceHandler } from './handlers/price';
import { aiHandler } from './handlers/ai';

//const agent = new HttpsProxyAgent("http://192.168.0.199:8080");

/*
export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN, {
  telegram: {
    agent: agent as any
  }
});
*/
export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

// команды
bot.start(startHandler);

// ВАЖНО: с аргументами
bot.hears(/^\/price (.+)/, priceHandler);

// AI (например любой текст)
bot.hears(/^\/ai (.+)/, aiHandler);
bot.on('text', aiHandler);


