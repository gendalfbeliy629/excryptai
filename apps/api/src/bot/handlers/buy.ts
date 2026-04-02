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
    `Биржа / данные: ${item.exchange}`,
    `Текущая цена: ${formatPrice(item.priceUsd)}`,
    `Зона входа: ${formatPrice(item.entryFromUsd)} - ${formatPrice(item.entryToUsd)}`,
    `Начальный stop-loss: ${formatPrice(item.initialStopLossUsd)} (-${item.riskPercent.toFixed(2)}%)`,
    `TP1: ${formatPrice(item.tp1Usd)} (${formatPercent(item.tp1Percent)}) | R/R 1:${item.riskRewardTp1.toFixed(2)}`,
    `TP2: ${formatPrice(item.tp2Usd)} (${formatPercent(item.tp2Percent)}) | R/R 1:${item.riskRewardTp2.toFixed(2)}`,
    `TP3: ${formatPrice(item.tp3Usd)} (${formatPercent(item.tp3Percent)}) | R/R 1:${item.riskRewardTp3.toFixed(2)}`,
    `Break-even только после подтверждения: ${formatPrice(item.breakEvenActivationPriceUsd)}`,
    `Цена безубытка после подтверждения: ${formatPrice(item.breakEvenPriceUsd)}`,
    `Trailing-stop после подтвержденного TP1: ${item.trailingStopPercent.toFixed(2)}% (ориентир ${formatPrice(item.trailingStopAfterTp1Usd)})`,
    `Room до ближайшего сопротивления: ${formatPercent(item.roomToResistancePercent)} | ATR 1H: ${formatPercent(item.atr1hPercent)}`,
    `Сопротивление 1: ${item.nearestResistanceUsd ? formatPrice(item.nearestResistanceUsd) : "n/a"} | Сопротивление 2: ${item.nextResistanceUsd ? formatPrice(item.nextResistanceUsd) : "n/a"}`,
    `Поддержка: ${item.nearestSupportUsd ? formatPrice(item.nearestSupportUsd) : "n/a"}`,
    `30д: ${formatPercent(item.change30d)} | 24ч: ${formatPercent(item.change24h)}`,
    `Тренд 30д: ${item.trend30d} | RSI: ${item.rsi14 !== null ? item.rsi14.toFixed(2) : "n/a"}`,
    `Score: ${item.score.toFixed(2)}`,
    `Почему BUY: ${item.reason}`,
    `Плюсы: ${item.positives.length ? item.positives.join("; ") : "n/a"}`,
    `Риски: ${item.negatives.length ? item.negatives.join("; ") : "n/a"}`,
    `|----------------------|`,
    `Как сопровождать сделку:\n${managementText}`,
  ].join("\n");
}

export function registerBuyHandler(bot: Telegraf) {
  bot.command("buy", async (ctx) => {
    try {
      await ctx.reply(
        "Сканирую рынок по Pionex и ищу только пары с подтвержденным BUY: 1D regime + 4H structure + 1H entry + room-to-resistance..."
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
          "Новая логика /buy:",
          "- данные берутся с Pionex по spot market",
          "- BUY дается только если есть место до ближайшего сопротивления",
          "- TP1 теперь консервативный и должен брать реальную прибыль, а не красивую математику 1R",
          "- безубыток включается только после подтверждения TP1, а не механически",
        ].join("\n");

        await ctx.reply(message);
        return;
      }

      const lines = result.buys.map((item: BuyCandidate) => buildBuyCard(item));

      const message = [
        "🟢 Пары с подтвержденным сигналом BUY",
        "",
        "Новая архитектура /buy:",
        "- источник market data: Pionex spot",
        "- фильтры: 1D regime, 4H structure, 1H entry, room-to-resistance, execution quality",
        "- TP1 ставится консервативно перед ближайшим сопротивлением",
        "- TP2 — основная цель",
        "- TP3 — расширенная цель / сопровождение остатка",
        "- stop-loss ставится по invalidation, а не просто по проценту",
        "- break-even переносится только после подтверждения движения",
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