import { Telegraf } from "telegraf";

export function registerStartHandler(bot: Telegraf) {
  bot.start(async (ctx) => {
    await ctx.reply(
      [
        "Привет! Я crypto-AI bot 🚀",
        "",
        "Доступные команды:",
        "/price BTC — контекст: текущая цена и метрики",
        "/ai BTC — AI-анализ на основе данных за 30 дней",
        "/buy — top-10 кандидатов к покупке по горизонту 1 месяц",
      ].join("\n")
    );
  });
}