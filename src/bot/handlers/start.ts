import { Telegraf } from "telegraf";

export function registerStartHandler(bot: Telegraf) {
  bot.start(async (ctx) => {
    await ctx.reply(
      [
        "Привет! Я crypto-AI bot 🚀",
        "",
        "Доступные команды:",
        "/price BTC",
        "/price ETH",
        "/ai Сделай анализ BTC",
      ].join("\n")
    );
  });
}