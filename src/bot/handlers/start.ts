import { Telegraf } from "telegraf";

export function registerStartHandler(bot: Telegraf) {
  bot.start((ctx) => {
  ctx.reply(`
    🚀 Crypto AI Bot

    Команды:
    узнай цену любой валюты, например BTC
    /price BTC

    Задай вопрос, например
    /ai какой текущий курс BTC, проверь историю курса за месяц, есть ли паттерны и расчитай BUY/Sell для BTC чтобы заработать 100$ при бюджете 1000$ в близжайшие 8 часов, дай рекомендацию, поменьше текста больше конкретики
  `);
  });
}