import { Telegraf } from "telegraf";

export function registerStartHandler(bot: Telegraf) {
  bot.start((ctx) => {
    ctx.reply("🚀 Бот работает!");
  });
}