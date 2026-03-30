import { Telegraf } from "telegraf";
import { getTopBuyPairs } from "../../services/buy.service";

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toFixed(2)}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  if (price >= 0.01) return `$${price.toFixed(6)}`;
  return `$${price.toFixed(8)}`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function registerBuyHandler(bot: Telegraf) {
  bot.command("buy", async (ctx) => {
    try {
      await ctx.reply(
        "Считаю top-10 кандидатов к покупке по горизонту 1 месяц..."
      );

      const pairs = await getTopBuyPairs(10);

      if (!pairs.length) {
        await ctx.reply(
          "❌ Не удалось подобрать пары. Попробуй позже."
        );
        return;
      }

      const lines = pairs.map((item) =>
        [
          `${item.rank}. ${item.pair} — ${item.signal}`,
          `Цена: ${formatPrice(item.priceUsd)}`,
          `30д: ${formatPercent(item.change30d)} | 24ч: ${formatPercent(item.change24h)}`,
          `Тренд 30д: ${item.trend30d} | RSI: ${item.rsi14 !== null ? item.rsi14.toFixed(2) : "n/a"}`,
          `Score: ${item.score.toFixed(2)}`,
          `Почему: ${item.reason}`,
        ].join("\n")
      );

      const message = [
        "🟢 Top-10 выгодных к покупке пар",
        "",
        "Логика отбора:",
        "- главный горизонт: 1 месяц",
        "- учитываются trend 30d, change 30d, RSI, положение цены в диапазоне 30д, SMA30, ликвидность и sentiment",
        "- список не является финансовой рекомендацией",
        "",
        ...lines,
      ].join("\n\n");

      await ctx.reply(message);
    } catch (error) {
      console.error("Buy handler error:", error);
      await ctx.reply("❌ Ошибка при расчёте команды /buy.");
    }
  });
}