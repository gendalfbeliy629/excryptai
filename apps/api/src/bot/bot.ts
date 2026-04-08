import { Telegraf } from "telegraf";
import { env } from "../config/env";
import { registerStartHandler } from "./handlers/start";
import { registerPriceHandler } from "./handlers/price";
import { registerAIHandler } from "./handlers/ai";
import { registerBuyHandler } from "./handlers/buy";
import { registerInfoHandler } from "./handlers/info";
import { rememberTelegramSubscriber } from "../utils/telegram-subscribers";

let botInstance: Telegraf | null = null;

export function getBot(): Telegraf {
  if (botInstance) {
    return botInstance;
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing required env var: TELEGRAM_BOT_TOKEN");
  }

  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    if (ctx.chat) {
      rememberTelegramSubscriber({
        chatId: ctx.chat.id,
        type: ctx.chat.type,
        title: "title" in ctx.chat ? ctx.chat.title : undefined,
        username: "username" in ctx.chat ? ctx.chat.username : undefined,
        firstName: "first_name" in ctx.chat ? ctx.chat.first_name : undefined
      });
    }

    return next();
  });

  registerStartHandler(bot);
  registerPriceHandler(bot);
  registerAIHandler(bot);
  registerBuyHandler(bot);
  registerInfoHandler(bot);

  botInstance = bot;
  return botInstance;
}