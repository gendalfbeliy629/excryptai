import { Telegraf } from "telegraf";
import {
  BuyCandidate,
  FailedMarketDetail,
  getBuyScanResult,
} from "../../services/buy.service";

const STABLE_QUOTES = new Set([
  "USD",
  "USDT",
  "USDC",
  "BUSD",
  "FDUSD",
  "TUSD",
  "DAI",
]);

function formatValue(value: number, quoteSymbol: string): string {
  const quote = quoteSymbol.toUpperCase();

  if (STABLE_QUOTES.has(quote)) {
    if (value >= 1000) return `$${value.toFixed(2)}`;
    if (value >= 1) return `$${value.toFixed(4)}`;
    if (value >= 0.01) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(8)}`;
  }

  if (value >= 1000) return `${value.toFixed(2)} ${quote}`;
  if (value >= 1) return `${value.toFixed(6)} ${quote}`;
  return `${value.toFixed(8)} ${quote}`;
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

function buildFailedMarketsBlock(
  failedDetails: FailedMarketDetail[],
  maxItems = 12
): string {
  if (!failedDetails.length) {
    return "Ошибок анализа нет.";
  }

  const lines = failedDetails
    .slice(0, maxItems)
    .map((item) => `- ${item.pair}: ${item.reason}`);

  if (failedDetails.length > maxItems) {
    lines.push(`- ... еще ${failedDetails.length - maxItems} рынков с ошибками`);
  }

  return lines.join("\n");
}

function buildBuyCard(item: BuyCandidate): string {
  const q = item.quoteSymbol;
  const managementText = item.managementPlan.map((step) => `- ${step}`).join("\n");

  return [
    `${item.rank}. ${item.pair} — ${item.signal}`,
    `Биржа / данные: ${item.exchange}`,
    `Текущая цена: ${formatValue(item.price, q)}`,
    `Зона входа: ${formatValue(item.entryFrom, q)} - ${formatValue(item.entryTo, q)}`,
    `Начальный stop-loss: ${formatValue(item.initialStopLoss, q)} (-${item.riskPercent.toFixed(2)}%)`,
    `TP1: ${formatValue(item.tp1, q)} (${formatPercent(item.tp1Percent)}) | R/R 1:${item.riskRewardTp1.toFixed(2)}`,
    `TP2: ${formatValue(item.tp2, q)} (${formatPercent(item.tp2Percent)}) | R/R 1:${item.riskRewardTp2.toFixed(2)}`,
    `TP3: ${formatValue(item.tp3, q)} (${formatPercent(item.tp3Percent)}) | R/R 1:${item.riskRewardTp3.toFixed(2)}`,
    `Break-even только после подтверждения: ${formatValue(item.breakEvenActivationPrice, q)}`,
    `Цена безубытка после подтверждения: ${formatValue(item.breakEvenPrice, q)}`,
    `Trailing-stop после подтвержденного TP1: ${item.trailingStopPercent.toFixed(2)}% (ориентир ${formatValue(item.trailingStopAfterTp1, q)})`,
    `Room до ближайшего сопротивления: ${formatPercent(item.roomToResistancePercent)} | ATR 1H: ${formatPercent(item.atr1hPercent)}`,
    `Сопротивление 1: ${item.nearestResistance !== null ? formatValue(item.nearestResistance, q) : "n/a"} | Сопротивление 2: ${item.nextResistance !== null ? formatValue(item.nextResistance, q) : "n/a"}`,
    `Поддержка: ${item.nearestSupport !== null ? formatValue(item.nearestSupport, q) : "n/a"}`,
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
        "Сканирую Pionex staged scan: stage 1 = все tickers/bookTickers, stage 2 = полный анализ только лучших кандидатов через rate limiter..."
      );

      const result = await getBuyScanResult(10);

      const summaryLines = [
        `- Всего spot-рынков на Pionex: ${result.summary.totalSpotMarkets}`,
        `- Stage 1 проверено быстрым фильтром: ${result.summary.stage1Checked}`,
        `- Stage 2 кандидатов на полный анализ: ${result.summary.stage2Candidates}`,
        `- Полностью проанализировано: ${result.summary.analyzedMarkets}`,
        `- Ошибок полного анализа: ${result.summary.failedMarkets}`,
        `- BUY: ${result.summary.buyCount}`,
        `- HOLD: ${result.summary.holdCount}`,
        `- SELL: ${result.summary.sellCount}`,
        `- BULLISH: ${result.summary.bullishCount}`,
        `- SIDEWAYS: ${result.summary.sidewaysCount}`,
        `- BEARISH: ${result.summary.bearishCount}`,
        `- Среднее изменение за 30д: ${formatPercent(result.summary.avgChange30d)}`,
        `- Средний RSI: ${formatNullable(result.summary.avgRsi14)}`,
      ];

      const failedBlock = buildFailedMarketsBlock(result.summary.failedDetails);

      if (!result.buys.length) {
        const message = [
          "⚪ Сейчас покупать нечего.",
          "",
          "Что происходит на рынке:",
          ...summaryLines,
          "",
          `Почему сейчас нет BUY: ${result.summary.explanation}`,
          "",
          "Какие рынки не удалось проверить и почему:",
          failedBlock,
        ].join("\n");

        await ctx.reply(message);
        return;
      }

      const lines = result.buys.map((item: BuyCandidate) => buildBuyCard(item));

      const message = [
        "🟢 Пары с подтвержденным сигналом BUY",
        "",
        "Сводка staged scan:",
        ...summaryLines,
        "",
        "Какие рынки не удалось проверить и почему:",
        failedBlock,
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