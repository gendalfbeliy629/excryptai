import { Telegraf } from "telegraf";
import { startHandler } from "./start";
import { priceHandler } from "./price";
import { aiHandler } from "./ai";

export function registerHandlers(bot: Telegraf) {
  bot.start((ctx) => startHandler(ctx));
  bot.on('message', (ctx) => priceHandler(ctx));
  aiHandler(bot);
}
