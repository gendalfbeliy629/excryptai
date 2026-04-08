import { Telegraf } from "telegraf";

export function registerStartHandler(bot: Telegraf) {
  bot.start(async (ctx) => {
    await ctx.reply(
      [
        "Привет! Я crypto-AI bot 🚀",
        "",
        "Доступные команды:",
        "/buy — показывает только пары с подтвержденным сигналом BUY на горизонте 1 месяц",
        "/price BTC/USDT — цена и метрики по паре",
        "/ai BTC/USDT — AI-анализ пары на основе данных за 30 дней",
        "/info BTC — краткая справка по монете"
      ].join("\n")
    );
  });
}