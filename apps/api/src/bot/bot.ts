import { Telegraf } from "telegraf";
import { env } from "../config/env";
import { registerStartHandler } from "./handlers/start";
import { registerPriceHandler } from "./handlers/price";
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
  registerBuyHandler(bot);
  registerInfoHandler(bot);

  void bot.telegram
    .setMyCommands([
      { command: "start", description: "Запуск и список доступных команд" },
      { command: "price", description: "Цена и метрики по паре" },
      { command: "info", description: "Краткая справка по монете" },
      { command: "ai", description: "AI-анализ пары" },
      { command: "buy", description: "BUY-сигналы по рынку" }
    ])
    .catch((error) => {
      console.error("Failed to register Telegram bot commands:", error);
    });

  botInstance = bot;
  return botInstance;
}