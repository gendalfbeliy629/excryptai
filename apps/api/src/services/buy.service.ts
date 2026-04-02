import { buildMarketContext, TrendType } from "./market.service";
import { evaluateMarketSignal } from "./signal.service";
import { SYMBOL_TO_COINCAP_ID } from "../utils/symbols";

export type BuyCandidate = {
  rank: number;
  pair: string;
  symbol: string;
  name: string;
  exchange: "PIONEX";
  priceUsd: number;
  entryFromUsd: number;
  entryToUsd: number;
  initialStopLossUsd: number;
  breakEvenActivationPriceUsd: number;
  breakEvenPriceUsd: number;
  trailingStopPercent: number;
  trailingStopAfterTp1Usd: number;
  tp1Usd: number;
  tp2Usd: number;
  tp3Usd: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  riskPercent: number;
  riskRewardTp1: number;
  riskRewardTp2: number;
  riskRewardTp3: number;
  nearestResistanceUsd: number | null;
  nextResistanceUsd: number | null;
  nearestSupportUsd: number | null;
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

type RawEvaluation = ReturnType<typeof evaluateMarketSignal> extends infer T ? NonNullable<T> : never;

export type BuyMarketSummary = {
  totalChecked: number;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  bullishCount: number;
  sidewaysCount: number;
  bearishCount: number;
  avgChange30d: number | null;
  avgRsi14: number | null;
  explanation: string;
};

export type BuyScanResult = {
  buys: BuyCandidate[];
  summary: BuyMarketSummary;
};

const CANDIDATE_SYMBOLS = Object.keys(SYMBOL_TO_COINCAP_ID);

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

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

function average(values: Array<number | null>): number | null {
  const filtered = values.filter((value): value is number => value !== null && Number.isFinite(value));
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

function buildTradePlan(item: RawEvaluation): Omit<BuyCandidate, "rank" | "pair" | "symbol" | "name" | "exchange" | "priceUsd" | "change24h" | "change30d" | "trend30d" | "rsi14" | "score" | "signal" | "reason" | "positives" | "negatives"> {
  const entryFromUsd = round(Math.min(item.entryZoneLowUsd ?? item.priceUsd, item.entryZoneHighUsd ?? item.priceUsd));
  const entryToUsd = round(Math.max(item.entryZoneLowUsd ?? item.priceUsd, item.entryZoneHighUsd ?? item.priceUsd));
  const entryMidUsd = round((entryFromUsd + entryToUsd) / 2);

  const atrUsd = item.atr1hUsd ?? item.priceUsd * 0.012;
  const supportBase = item.nearestSupportUsd ?? entryFromUsd - atrUsd * 0.9;
  const initialStopLossUsd = round(Math.min(entryFromUsd - atrUsd * 0.25, supportBase - atrUsd * 0.2));

  const riskPercent = Math.abs(percentDifference(entryMidUsd, initialStopLossUsd));
  const riskDistanceUsd = Math.max(entryMidUsd - initialStopLossUsd, entryMidUsd * 0.01);

  let tp1Usd = item.nearestResistanceUsd !== null
    ? item.nearestResistanceUsd - atrUsd * 0.18
    : entryMidUsd + Math.max(atrUsd * 1.2, entryMidUsd * 0.012);

  const minTp1Usd = entryMidUsd * 1.012;
  if (tp1Usd < minTp1Usd) {
    tp1Usd = minTp1Usd;
  }

  let tp2Usd = item.nextResistanceUsd !== null
    ? item.nextResistanceUsd - atrUsd * 0.18
    : entryMidUsd + Math.max(atrUsd * 2.4, riskDistanceUsd * 1.8);

  if (tp2Usd <= tp1Usd) {
    tp2Usd = tp1Usd + Math.max(atrUsd * 0.9, riskDistanceUsd * 0.9);
  }

  let tp3Usd = Math.max(
    tp2Usd + Math.max(atrUsd * 1.2, riskDistanceUsd * 1.1),
    entryMidUsd + Math.max(atrUsd * 3.2, riskDistanceUsd * 2.4)
  );

  tp1Usd = round(tp1Usd);
  tp2Usd = round(tp2Usd);
  tp3Usd = round(tp3Usd);

  const tp1Percent = percentDifference(entryMidUsd, tp1Usd);
  const tp2Percent = percentDifference(entryMidUsd, tp2Usd);
  const tp3Percent = percentDifference(entryMidUsd, tp3Usd);

  const riskRewardTp1 = Number(((tp1Usd - entryMidUsd) / Math.max(entryMidUsd - initialStopLossUsd, 0.00000001)).toFixed(2));
  const riskRewardTp2 = Number(((tp2Usd - entryMidUsd) / Math.max(entryMidUsd - initialStopLossUsd, 0.00000001)).toFixed(2));
  const riskRewardTp3 = Number(((tp3Usd - entryMidUsd) / Math.max(entryMidUsd - initialStopLossUsd, 0.00000001)).toFixed(2));

  const breakEvenActivationPriceUsd = round(Math.max(item.breakEvenActivationPriceUsd ?? tp1Usd, tp1Usd));
  const breakEvenPriceUsd = round(entryMidUsd * 1.002);

  const atrPercent = item.atr1hPercent ?? 1.2;
  const trailingStopPercent = Number(clamp(atrPercent * item.trailingAtrMultiplier, 1.6, 4.8).toFixed(2));
  const trailingStopAfterTp1Usd = round(Math.max(breakEvenPriceUsd, tp1Usd * (1 - trailingStopPercent / 100)));

  const managementPlan = [
    `Входить зоной ${entryFromUsd} - ${entryToUsd}, не брать цену выше верхней границы зоны`,
    `Начальный стоп поставить на ${initialStopLossUsd}; если цена закрывает 1H ниже этого уровня, long-сценарий сломан`,
    `TP1 (${tp1Usd}) специально консервативный: забрать 20-30% позиции и зафиксировать первый реальный плюс`,
    `Переводить стоп в безубыток только после подтверждения: 1H закрытие выше TP1 или проход цены до ${breakEvenActivationPriceUsd}`,
    `После подтвержденного TP1 стоп можно поднять в ${breakEvenPriceUsd}`,
    `TP2 (${tp2Usd}) — основная цель, там можно закрыть еще 40-50% позиции`,
    `Остаток вести к TP3 (${tp3Usd}) или по trailing-stop ${trailingStopPercent}% (ориентир ${trailingStopAfterTp1Usd})`
  ];

  return {
    entryFromUsd,
    entryToUsd,
    initialStopLossUsd,
    breakEvenActivationPriceUsd,
    breakEvenPriceUsd,
    trailingStopPercent,
    trailingStopAfterTp1Usd,
    tp1Usd,
    tp2Usd,
    tp3Usd,
    tp1Percent,
    tp2Percent,
    tp3Percent,
    riskPercent,
    riskRewardTp1,
    riskRewardTp2,
    riskRewardTp3,
    nearestResistanceUsd: item.nearestResistanceUsd,
    nextResistanceUsd: item.nextResistanceUsd,
    nearestSupportUsd: item.nearestSupportUsd,
    roomToResistancePercent: item.roomToResistancePercent,
    atr1hPercent: item.atr1hPercent,
    managementPlan,
  };
}

function buildNoBuyExplanation(summary: BuyMarketSummary): string {
  const reasons: string[] = [];

  if (summary.buyCount > 0) {
    return "На рынке есть пары, которые прошли новые фильтры regime + setup + space + execution.";
  }

  if (summary.sidewaysCount >= summary.bullishCount && summary.sidewaysCount >= summary.bearishCount) {
    reasons.push("рынок в основном боковой");
  }

  if (summary.bearishCount > summary.bullishCount) {
    reasons.push("медвежьих сценариев больше, чем бычьих");
  }

  if (summary.avgChange30d !== null && summary.avgChange30d < 4) {
    reasons.push("средний месячный импульс слабый");
  }

  if (summary.avgRsi14 !== null && (summary.avgRsi14 > 68 || summary.avgRsi14 < 44)) {
    reasons.push("RSI по рынку уходит из комфортной зоны");
  }

  if (!reasons.length) {
    reasons.push("монеты не проходят фильтры по room-to-resistance, 4H/1H структуре и качеству исполнения");
  }

  return reasons.join(", ");
}

function toSummary(items: RawEvaluation[]): BuyMarketSummary {
  const buyCount = items.filter((item) => item.signal === "BUY").length;
  const holdCount = items.filter((item) => item.signal === "HOLD").length;
  const sellCount = items.filter((item) => item.signal === "SELL").length;

  const bullishCount = items.filter((item) => item.trend30d === "BULLISH").length;
  const sidewaysCount = items.filter((item) => item.trend30d === "SIDEWAYS").length;
  const bearishCount = items.filter((item) => item.trend30d === "BEARISH").length;

  const avgChange30d = average(items.map((item) => item.change30d));
  const avgRsi14 = average(items.map((item) => item.rsi14));

  const summary: BuyMarketSummary = {
    totalChecked: items.length,
    buyCount,
    holdCount,
    sellCount,
    bullishCount,
    sidewaysCount,
    bearishCount,
    avgChange30d,
    avgRsi14,
    explanation: ""
  };

  summary.explanation = buildNoBuyExplanation(summary);
  return summary;
}

export async function getBuyScanResult(limit = 10): Promise<BuyScanResult> {
  const evaluated = await mapWithConcurrency(CANDIDATE_SYMBOLS, 4, async (symbol): Promise<RawEvaluation | null> => {
    try {
      const market = await buildMarketContext(symbol);
      const evaluation = evaluateMarketSignal(market);
      return evaluation ?? null;
    } catch (error) {
      console.error(`Buy scan failed for ${symbol}:`, error);
      return null;
    }
  });

  const validItems = evaluated.filter((item): item is RawEvaluation => item !== null);
  const summary = toSummary(validItems);

  const buys: BuyCandidate[] = validItems
    .filter((item): item is RawEvaluation & { signal: "BUY" } => item.signal === "BUY")
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      pair: item.pair,
      symbol: item.symbol,
      name: item.name,
      exchange: "PIONEX",
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

  return { buys, summary };
}