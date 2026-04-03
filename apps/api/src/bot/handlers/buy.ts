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

function formatUnixTime(value: number | null): string {
  if (!value || !Number.isFinite(value)) return "n/a";
  return new Date(value).toISOString().replace(".000Z", "Z");
}

function formatConfirmationStrategy(strategy: string): string {
  switch (strategy) {
    case "1H_CANDLE_CLOSE":
      return "1H candle close";
    case "1H_RETEST":
      return "retest";
    case "1H_BREAKOUT_RETEST":
      return "breakout-retest";
    default:
      return "n/a";
  }
}

function joinMessageSections(sections: Array<string | null | undefined | false>): string {
  return sections
    .map((section) => (typeof section === "string" ? section.trim() : ""))
    .filter((section) => section.length > 0)
    .join("\n\n");
}

function buildFailedMarketsBlock(
  failedDetails: FailedMarketDetail[],
  maxItems = 12
): string {
  if (!failedDetails.length) {
    return "";
  }

  const lines = failedDetails
    .slice(0, maxItems)
    .map((item) => `- ${item.pair}: ${item.reason}`);

  if (failedDetails.length > maxItems) {
    lines.push(`- ... еще ${failedDetails.length - maxItems} рынков с ошибками`);
  }

  return lines.join("\n");
}

function buildFailedMarketsSection(failedDetails: FailedMarketDetail[]): string {
  if (!failedDetails.length) {
    return "";
  }

  return joinMessageSections([
    "Какие рынки не удалось проверить и почему:",
    buildFailedMarketsBlock(failedDetails),
  ]);
}

function buildSummaryBlock(result: Awaited<ReturnType<typeof getBuyScanResult>>): string {
  const summaryLines = [
    `- Всего spot-рынков на Pionex: ${result.summary.totalSpotMarkets}`,
    `- Stage 1 проверено быстрым фильтром: ${result.summary.stage1Checked}`,
    `- Stage 2 кандидатов на полный анализ: ${result.summary.stage2Candidates}`,
    `- Полностью проанализировано: ${result.summary.analyzedMarkets}`,
    `- Ошибок полного анализа: ${result.summary.failedMarkets}`,
    `- BUY после confirm-layer: ${result.summary.buyCount}`,
    `- HOLD: ${result.summary.holdCount}`,
    `- SELL: ${result.summary.sellCount}`,
    `- BULLISH: ${result.summary.bullishCount}`,
    `- SIDEWAYS: ${result.summary.sidewaysCount}`,
    `- BEARISH: ${result.summary.bearishCount}`,
    `- Среднее изменение за 30д: ${formatPercent(result.summary.avgChange30d)}`,
    `- Средний RSI: ${formatNullable(result.summary.avgRsi14)}`,
  ];

  return summaryLines.join("\n");
}

function buildBuyCard(item: BuyCandidate): string {
  const q = item.quoteSymbol;
  const managementText = item.managementPlan.map((step) => `- ${step}`).join("\n");

  return [
    `${item.rank}. ${item.pair} — ${item.signal}`,
    `Биржа / данные: ${item.exchange}`,
    `Текущая цена: ${formatValue(item.price, q)}`,
    `Зона входа: ${formatValue(item.entryFrom, q)} - ${formatValue(item.entryTo, q)}`,
    `Подтверждение входа: ${formatConfirmationStrategy(item.entryConfirmationStrategy)} | статус ${item.entryConfirmationStatus}`,
    `Последний закрытый 1H candle: ${item.lastClosed1hCandleClose !== null ? formatValue(item.lastClosed1hCandleClose, q) : "n/a"} | время ${formatUnixTime(item.lastClosed1hCandleTime)}`,
    `Уровень подтверждения: ${item.confirmationLevel !== null ? formatValue(item.confirmationLevel, q) : "n/a"} | retest: ${item.confirmationRetestLevel !== null ? formatValue(item.confirmationRetestLevel, q) : "n/a"}`,
    `Breakout-уровень: ${item.confirmationBreakoutLevel !== null ? formatValue(item.confirmationBreakoutLevel, q) : "n/a"}`,
    `Комментарий confirm-layer: ${item.entryConfirmationText}`,
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
        "Сканирую Pionex staged scan: stage 1 = все tickers/bookTickers, stage 2 = полный анализ только лучших кандидатов через rate limiter, stage 3 = confirm-layer только по закрытой 1H свече (close / retest / breakout-retest)..."
      );

      const result = await getBuyScanResult(10);

      const summaryBlock = buildSummaryBlock(result);
      const failedSection = buildFailedMarketsSection(result.summary.failedDetails);

      if (!result.buys.length) {
        const message = joinMessageSections([
          "⚪ Сейчас покупать нечего.",
          joinMessageSections([
            "Что происходит на рынке:",
            summaryBlock,
          ]),
          `Почему сейчас нет BUY: ${result.summary.explanation}`,
          failedSection,
        ]);

        await ctx.reply(message);
        return;
      }

      const buyCards = result.buys.map((item: BuyCandidate) => buildBuyCard(item)).join("\n\n");

      const message = joinMessageSections([
        "🟢 Пары с подтвержденным сигналом BUY",
        joinMessageSections([
          "Сводка staged scan:",
          summaryBlock,
        ]),
        failedSection,
        buyCards,
      ]);

      await ctx.reply(message);
    } catch (error) {
      console.error("Buy handler error:", error);
      await ctx.reply("❌ Ошибка при расчёте команды /buy.");
    }
  });
}