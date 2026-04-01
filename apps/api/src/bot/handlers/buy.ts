import { Telegraf } from "telegraf";
import { BuyCandidate, getBuyScanResult } from "../../services/buy.service";

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

function formatNullable(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function buildBuyCard(item: BuyCandidate): string {
  const managementText = item.managementPlan.map((step) => `- ${step}`).join("\n");

  return [
    `${item.rank}. ${item.pair} — ${item.signal}`,
    `Текущая цена: ${formatPrice(item.priceUsd)}`,
    `Покупка: до ${formatPrice(item.buyPriceUsd)}`,
    `Начальный stop-loss: ${formatPrice(item.initialStopLossUsd)} (-${item.riskPercent.toFixed(2)}%)`,
    `TP1: ${formatPrice(item.tp1Usd)} (${formatPercent(item.tp1Percent)}) | R/R 1:${item.riskRewardTp1.toFixed(2)}`,
    `TP2: ${formatPrice(item.tp2Usd)} (${formatPercent(item.tp2Percent)}) | R/R 1:${item.riskRewardTp2.toFixed(2)}`,
    `TP3: ${formatPrice(item.tp3Usd)} (${formatPercent(item.tp3Percent)}) | R/R 1:${item.riskRewardTp3.toFixed(2)}`,
    `Break-even после TP1: ${formatPrice(item.breakEvenPriceUsd)}`,
    `Trailing-stop после TP1: ${item.trailingStopPercent.toFixed(1)}% (ориентир ${formatPrice(item.trailingStopAfterTp1Usd)})`,
    `30д: ${formatPercent(item.change30d)} | 24ч: ${formatPercent(item.change24h)}`,
    `Тренд 30д: ${item.trend30d} | RSI: ${
      item.rsi14 !== null ? item.rsi14.toFixed(2) : "n/a"
    }`,
    `Score: ${item.score.toFixed(2)}`,
    `Почему: ${item.reason}`,
    `|----------------------|`,
    `Как сопровождать сделку:\n${managementText}`,
  ].join("\n");
}

export function registerBuyHandler(bot: Telegraf) {
  bot.command("buy", async (ctx) => {
    try {
      await ctx.reply(
        "Сканирую рынок и ищу только пары с подтвержденным сигналом BUY на горизонте 1 месяц..."
      );

      const result = await getBuyScanResult(10);

      if (!result.buys.length) {
        const message = [
          "⚪ Сейчас покупать нечего.",
          "",
          "Что происходит на рынке:",
          `- Проверено монет: ${result.summary.totalChecked}`,
          `- BUY: ${result.summary.buyCount}`,
          `- HOLD: ${result.summary.holdCount}`,
          `- SELL: ${result.summary.sellCount}`,
          `- BULLISH: ${result.summary.bullishCount}`,
          `- SIDEWAYS: ${result.summary.sidewaysCount}`,
          `- BEARISH: ${result.summary.bearishCount}`,
          `- Среднее изменение за 30д: ${formatPercent(result.summary.avgChange30d)}`,
          `- Средний RSI: ${formatNullable(result.summary.avgRsi14)}`,
          "",
          `Почему сейчас нет BUY: ${result.summary.explanation}`,
          "",
          "Логика:",
          "- /buy показывает только deterministic signal = BUY",
          "- HOLD и SELL в список не попадают",
          "- если ни одна монета не прошла фильтры, бот сообщает, что точек входа сейчас нет",
        ].join("\n");

        await ctx.reply(message);
        return;
      }

      const lines = result.buys.map((item: BuyCandidate) => buildBuyCard(item));

      const message = [
        "🟢 Пары с подтвержденным сигналом BUY",
        "",
        "Логика отбора:",
        "- главный горизонт: 1 месяц",
        "- в выдачу попадают только пары с deterministic signal = BUY",
        "- для каждой пары показываются вход, начальный стоп, TP1 / TP2 / TP3",
        "- после TP1 бот показывает перевод стопа в безубыток и trailing-stop",
        "- HOLD и SELL скрываются",
        "- учитываются trend 30d, change 30d, RSI, диапазон 30д, SMA30, ликвидность и sentiment",
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