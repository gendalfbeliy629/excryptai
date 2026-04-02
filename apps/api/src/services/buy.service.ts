import { buildMarketContext, TrendType } from "./market.service";
import { evaluateMarketSignal } from "./signal.service";
import { getAllPionexSpotMarkets, PionexSpotMarket } from "./pionex.service";

export type BuyCandidate = {
  rank: number;
  pair: string;
  symbol: string;
  quoteSymbol: string;
  name: string;
  exchange: "PIONEX";
  price: number;
  priceUsd: number | null;
  entryFrom: number;
  entryTo: number;
  initialStopLoss: number;
  breakEvenActivationPrice: number;
  breakEvenPrice: number;
  trailingStopPercent: number;
  trailingStopAfterTp1: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  riskPercent: number;
  riskRewardTp1: number;
  riskRewardTp2: number;
  riskRewardTp3: number;
  nearestResistance: number | null;
  nextResistance: number | null;
  nearestSupport: number | null;
  roomToResistancePercent: number | null;
  atr1hPercent: number | null;
  change24h: number | null;
  change30d: number | null;
  trend30d: TrendType;
  rsi14: number | null;
  score: number;
  signal: "BUY";
  reason: string;
  positives: string[];
  negatives: string[];
  managementPlan: string[];
};

type RawEvaluation = NonNullable<ReturnType<typeof evaluateMarketSignal>>;

type ScanItemResult =
  | {
      status: "ok";
      market: PionexSpotMarket;
      evaluation: RawEvaluation;
    }
  | {
      status: "failed";
      market: PionexSpotMarket;
      error: string;
    };

export type FailedMarketDetail = {
  pair: string;
  reason: string;
};

export type BuyMarketSummary = {
  totalSpotMarkets: number;
  totalChecked: number;
  analyzedMarkets: number;
  failedMarkets: number;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  bullishCount: number;
  sidewaysCount: number;
  bearishCount: number;
  avgChange30d: number | null;
  avgRsi14: number | null;
  explanation: string;
  failedDetails: FailedMarketDetail[];
};

export type BuyScanResult = {
  buys: BuyCandidate[];
  summary: BuyMarketSummary;
};

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let currentIndex = 0;

  async function run(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );

  return results;
}

function average(values: Array<number | null>): number | null {
  const filtered = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );

  if (!filtered.length) return null;

  return filtered.reduce((acc, value) => acc + value, 0) / filtered.length;
}

function round(value: number): number {
  return Number(value.toFixed(8));
}

function percentDifference(from: number, to: number): number {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) {
    return 0;
  }

  return Number((((to - from) / from) * 100).toFixed(2));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeErrorReason(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown scan error";
}

function buildTradePlan(
  item: RawEvaluation
): Omit<
  BuyCandidate,
  | "rank"
  | "pair"
  | "symbol"
  | "quoteSymbol"
  | "name"
  | "exchange"
  | "price"
  | "priceUsd"
  | "change24h"
  | "change30d"
  | "trend30d"
  | "rsi14"
  | "score"
  | "signal"
  | "reason"
  | "positives"
  | "negatives"
> {
  const entryFrom = round(
    Math.min(item.entryZoneLow ?? item.price, item.entryZoneHigh ?? item.price)
  );
  const entryTo = round(
    Math.max(item.entryZoneLow ?? item.price, item.entryZoneHigh ?? item.price)
  );
  const entryMid = round((entryFrom + entryTo) / 2);

  const atr = item.atr1h ?? item.price * 0.012;
  const supportBase = item.nearestSupport ?? entryFrom - atr * 0.9;
  const initialStopLoss = round(
    Math.min(entryFrom - atr * 0.25, supportBase - atr * 0.2)
  );

  const riskPercent = Math.abs(percentDifference(entryMid, initialStopLoss));
  const riskDistance = Math.max(entryMid - initialStopLoss, entryMid * 0.01);

  let tp1 =
    item.nearestResistance !== null
      ? item.nearestResistance - atr * 0.18
      : entryMid + Math.max(atr * 1.2, entryMid * 0.012);

  const minTp1 = entryMid * 1.012;
  if (tp1 < minTp1) {
    tp1 = minTp1;
  }

  let tp2 =
    item.nextResistance !== null
      ? item.nextResistance - atr * 0.18
      : entryMid + Math.max(atr * 2.4, riskDistance * 1.8);

  if (tp2 <= tp1) {
    tp2 = tp1 + Math.max(atr * 0.9, riskDistance * 0.9);
  }

  let tp3 = Math.max(
    tp2 + Math.max(atr * 1.2, riskDistance * 1.1),
    entryMid + Math.max(atr * 3.2, riskDistance * 2.4)
  );

  tp1 = round(tp1);
  tp2 = round(tp2);
  tp3 = round(tp3);

  const tp1Percent = percentDifference(entryMid, tp1);
  const tp2Percent = percentDifference(entryMid, tp2);
  const tp3Percent = percentDifference(entryMid, tp3);

  const denominator = Math.max(entryMid - initialStopLoss, 0.00000001);

  const riskRewardTp1 = Number(((tp1 - entryMid) / denominator).toFixed(2));
  const riskRewardTp2 = Number(((tp2 - entryMid) / denominator).toFixed(2));
  const riskRewardTp3 = Number(((tp3 - entryMid) / denominator).toFixed(2));

  const breakEvenActivationPrice = round(
    Math.max(item.breakEvenActivationPrice ?? tp1, tp1)
  );
  const breakEvenPrice = round(entryMid * 1.002);

  const atrPercent = item.atr1hPercent ?? 1.2;
  const trailingStopPercent = Number(
    clamp(atrPercent * item.trailingAtrMultiplier, 1.6, 4.8).toFixed(2)
  );

  const trailingStopAfterTp1 = round(
    Math.max(breakEvenPrice, tp1 * (1 - trailingStopPercent / 100))
  );

  const managementPlan = [
    `Входить зоной ${entryFrom} - ${entryTo}, не брать цену выше верхней границы зоны`,
    `Начальный стоп поставить на ${initialStopLoss}; если цена закрывает 1H ниже этого уровня, long-сценарий сломан`,
    `TP1 (${tp1}) специально консервативный: забрать 20-30% позиции и зафиксировать первый реальный плюс`,
    `Переводить стоп в безубыток только после подтверждения: 1H закрытие выше TP1 или проход цены до ${breakEvenActivationPrice}`,
    `После подтвержденного TP1 стоп можно поднять в ${breakEvenPrice}`,
    `TP2 (${tp2}) — основная цель, там можно закрыть еще 40-50% позиции`,
    `Остаток вести к TP3 (${tp3}) или по trailing-stop ${trailingStopPercent}% (ориентир ${trailingStopAfterTp1})`,
  ];

  return {
    entryFrom,
    entryTo,
    initialStopLoss,
    breakEvenActivationPrice,
    breakEvenPrice,
    trailingStopPercent,
    trailingStopAfterTp1,
    tp1,
    tp2,
    tp3,
    tp1Percent,
    tp2Percent,
    tp3Percent,
    riskPercent,
    riskRewardTp1,
    riskRewardTp2,
    riskRewardTp3,
    nearestResistance: item.nearestResistance,
    nextResistance: item.nextResistance,
    nearestSupport: item.nearestSupport,
    roomToResistancePercent: item.roomToResistancePercent,
    atr1hPercent: item.atr1hPercent,
    managementPlan,
  };
}

function buildNoBuyExplanation(summary: BuyMarketSummary): string {
  const reasons: string[] = [];

  if (summary.buyCount > 0) {
    return "На рынке есть пары, которые прошли фильтры regime + setup + space + execution.";
  }

  if (summary.failedMarkets > 0) {
    reasons.push(`часть рынков не удалось проанализировать (${summary.failedMarkets})`);
  }

  if (
    summary.sidewaysCount >= summary.bullishCount &&
    summary.sidewaysCount >= summary.bearishCount
  ) {
    reasons.push("рынок в основном боковой");
  }

  if (summary.bearishCount > summary.bullishCount) {
    reasons.push("медвежьих сценариев больше, чем бычьих");
  }

  if (summary.avgChange30d !== null && summary.avgChange30d < 4) {
    reasons.push("средний месячный импульс слабый");
  }

  if (
    summary.avgRsi14 !== null &&
    (summary.avgRsi14 > 68 || summary.avgRsi14 < 44)
  ) {
    reasons.push("RSI по рынку уходит из комфортной зоны");
  }

  if (!reasons.length) {
    reasons.push(
      "рынки не проходят фильтры по room-to-resistance, 4H/1H структуре и качеству исполнения"
    );
  }

  return reasons.join(", ");
}

function toSummary(scanResults: ScanItemResult[]): BuyMarketSummary {
  const analyzedItems = scanResults
    .filter(
      (item): item is Extract<ScanItemResult, { status: "ok" }> =>
        item.status === "ok"
    )
    .map((item) => item.evaluation);

  const failedItems = scanResults.filter(
    (item): item is Extract<ScanItemResult, { status: "failed" }> =>
      item.status === "failed"
  );

  const buyCount = analyzedItems.filter((item) => item.signal === "BUY").length;
  const holdCount = analyzedItems.filter((item) => item.signal === "HOLD").length;
  const sellCount = analyzedItems.filter((item) => item.signal === "SELL").length;

  const bullishCount = analyzedItems.filter(
    (item) => item.trend30d === "BULLISH"
  ).length;
  const sidewaysCount = analyzedItems.filter(
    (item) => item.trend30d === "SIDEWAYS"
  ).length;
  const bearishCount = analyzedItems.filter(
    (item) => item.trend30d === "BEARISH"
  ).length;

  const summary: BuyMarketSummary = {
    totalSpotMarkets: scanResults.length,
    totalChecked: scanResults.length,
    analyzedMarkets: analyzedItems.length,
    failedMarkets: failedItems.length,
    buyCount,
    holdCount,
    sellCount,
    bullishCount,
    sidewaysCount,
    bearishCount,
    avgChange30d: average(analyzedItems.map((item) => item.change30d)),
    avgRsi14: average(analyzedItems.map((item) => item.rsi14)),
    explanation: "",
    failedDetails: failedItems.map((item) => ({
      pair: `${item.market.baseSymbol}/${item.market.quoteSymbol}`,
      reason: item.error,
    })),
  };

  summary.explanation = buildNoBuyExplanation(summary);
  return summary;
}

export async function getBuyScanResult(limit = 10): Promise<BuyScanResult> {
  const markets = await getAllPionexSpotMarkets();

  const scanResults = await mapWithConcurrency(
    markets,
    3,
    async (market): Promise<ScanItemResult> => {
      try {
        const marketContext = await buildMarketContext(
          market.baseSymbol,
          market.quoteSymbol
        );

        const evaluation = evaluateMarketSignal(marketContext);

        if (!evaluation) {
          return {
            status: "failed",
            market,
            error: "Signal evaluation returned null",
          };
        }

        return {
          status: "ok",
          market,
          evaluation,
        };
      } catch (error) {
        return {
          status: "failed",
          market,
          error: normalizeErrorReason(error),
        };
      }
    }
  );

  const summary = toSummary(scanResults);

  const buys: BuyCandidate[] = scanResults
    .filter(
      (item): item is Extract<ScanItemResult, { status: "ok" }> =>
        item.status === "ok"
    )
    .map((item) => item.evaluation)
    .filter(
      (item): item is RawEvaluation & { signal: "BUY" } => item.signal === "BUY"
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      pair: item.pair,
      symbol: item.symbol,
      quoteSymbol: item.quoteSymbol,
      name: item.name,
      exchange: "PIONEX",
      price: item.price,
      priceUsd: item.priceUsd,
      ...buildTradePlan(item),
      change24h: item.change24h,
      change30d: item.change30d,
      trend30d: item.trend30d,
      rsi14: item.rsi14,
      score: item.score,
      signal: "BUY",
      reason: item.reason,
      positives: item.positives,
      negatives: item.negatives,
    }));

  return {
    buys,
    summary,
  };
}