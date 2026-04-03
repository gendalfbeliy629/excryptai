import { buildMarketContext, TrendType } from "./market.service";
import {
  getAllPionexSpotBookTickers,
  getAllPionexSpotMarkets,
  getAllPionexSpotTickers,
  getPionexDepth,
  PionexBookTicker,
  PionexSpotMarket,
  PionexTicker,
} from "./pionex.service";
import { evaluateMarketSignal } from "./signal.service";

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
  entryConfirmationStatus: string;
  entryConfirmationStrategy: string;
  entryConfirmationText: string;
  confirmationLevel: number | null;
  confirmationRetestLevel: number | null;
  confirmationBreakoutLevel: number | null;
  lastClosed1hCandleTime: number | null;
  lastClosed1hCandleClose: number | null;
  managementPlan: string[];
};

type RawEvaluation = NonNullable<ReturnType<typeof evaluateMarketSignal>>;

type ScanItemResult =
  | {
      status: "ok";
      market: PionexSpotMarket;
      evaluation: RawEvaluation;
      stage: "full";
    }
  | {
      status: "failed";
      market: PionexSpotMarket;
      stage: "full";
      error: string;
    };

export type FailedMarketDetail = {
  pair: string;
  reason: string;
};

export type BuyMarketSummary = {
  totalSpotMarkets: number;
  stage1Checked: number;
  stage2Candidates: number;
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

type Stage1Candidate = {
  market: PionexSpotMarket;
  ticker: PionexTicker;
  bookTicker: PionexBookTicker | null;
  stage1Score: number;
  spreadPercent: number | null;
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

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));

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

function buildStage1Candidates(
  markets: PionexSpotMarket[],
  tickers: PionexTicker[],
  bookTickers: PionexBookTicker[]
): Stage1Candidate[] {
  const tickerMap = new Map<string, PionexTicker>(tickers.map((item) => [item.symbol, item]));
  const bookTickerMap = new Map<string, PionexBookTicker>(
    bookTickers.map((item) => [item.symbol, item])
  );

  const candidates: Stage1Candidate[] = [];

  for (const market of markets) {
    const ticker = tickerMap.get(market.symbol);
    if (!ticker) {
      continue;
    }

    const bookTicker = bookTickerMap.get(market.symbol) ?? null;
    const spreadPercent =
      bookTicker && bookTicker.askPrice > 0
        ? ((bookTicker.askPrice - bookTicker.bidPrice) / bookTicker.askPrice) * 100
        : null;

    let score = 0;

    if (ticker.changePercent24h !== null) {
      if (ticker.changePercent24h >= -3 && ticker.changePercent24h <= 8) score += 12;
      else if (ticker.changePercent24h > 8 && ticker.changePercent24h <= 15) score += 4;
      else score -= 8;
    }

    if (ticker.amount > 0) {
      if (ticker.amount >= 5_000_000) score += 14;
      else if (ticker.amount >= 1_000_000) score += 10;
      else if (ticker.amount >= 250_000) score += 6;
      else score += 1;
    }

    if (spreadPercent !== null) {
      if (spreadPercent <= 0.12) score += 10;
      else if (spreadPercent <= 0.22) score += 5;
      else score -= 10;
    }

    const intradayRangePercent =
      ticker.close > 0 ? ((ticker.high - ticker.low) / ticker.close) * 100 : 0;

    if (intradayRangePercent >= 1.2 && intradayRangePercent <= 10) {
      score += 6;
    } else if (intradayRangePercent > 15) {
      score -= 8;
    }

    candidates.push({
      market,
      ticker,
      bookTicker,
      stage1Score: score,
      spreadPercent,
    });
  }

  candidates.sort((a, b) => b.stage1Score - a.stage1Score);

  const dynamicLimit = Math.max(40, Math.min(120, Math.ceil(candidates.length * 0.22)));
  return candidates.slice(0, dynamicLimit);
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
  const entryFrom = round(Math.min(item.entryZoneLow ?? item.price, item.entryZoneHigh ?? item.price));
  const entryTo = round(Math.max(item.entryZoneLow ?? item.price, item.entryZoneHigh ?? item.price));
  const entryMid = round((entryFrom + entryTo) / 2);

  const atr = item.atr1h ?? item.price * 0.012;
  const initialStopLoss = round(
    item.protectiveStop ?? Math.min(entryFrom - atr * 0.8, entryFrom * 0.975)
  );

  const riskPercent = Math.abs(percentDifference(entryMid, initialStopLoss));
  const riskDistance = Math.max(entryMid - initialStopLoss, entryMid * 0.01);

  const firstResistance = item.nearestResistance;
  const secondResistance = item.nextResistance ?? item.nearestResistance;

  let tp1 =
    firstResistance !== null
      ? firstResistance - atr * 0.35
      : entryMid + Math.max(riskDistance * 1.9, atr * 1.7);

  const minTp1 = entryMid + Math.max(riskDistance * 1.8, atr * 1.25);
  if (tp1 < minTp1) {
    tp1 = minTp1;
  }

  let tp2 =
    secondResistance !== null
      ? secondResistance - atr * 0.28
      : entryMid + Math.max(riskDistance * 2.8, atr * 2.4);

  if (tp2 <= tp1) {
    tp2 = tp1 + Math.max(riskDistance * 0.9, atr * 0.9);
  }

  let tp3 = Math.max(
    tp2 + Math.max(riskDistance * 1.1, atr * 1.2),
    entryMid + Math.max(riskDistance * 4.0, atr * 3.4)
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

  const breakEvenActivationPrice = round(Math.max(item.breakEvenActivationPrice ?? tp1, tp1));
  const breakEvenPrice = round(entryMid * 1.001);

  const atrPercent = item.atr1hPercent ?? 1.4;
  const trailingStopPercent = Number(clamp(atrPercent * item.trailingAtrMultiplier, 2.2, 5.6).toFixed(2));

  const trailingStopAfterTp1 = round(Math.max(breakEvenPrice, tp1 * (1 - trailingStopPercent / 100)));

  const confirmationStep =
    item.entryConfirmationStrategy === "1H_BREAKOUT_RETEST"
      ? `Текущий допуск в сделку получен только потому, что рынок уже дал breakout-retest выше ${round(
          item.confirmationBreakoutLevel ?? entryTo
        )}`
      : item.entryConfirmationStrategy === "1H_RETEST"
        ? `Текущий допуск в сделку получен после 1H retest уровня ${round(
            item.confirmationRetestLevel ?? entryFrom
          )} и закрытия часа обратно вверх`
        : `Текущий допуск в сделку получен после уверенного 1H close выше ${round(
            item.confirmationLevel ?? entryTo
          )}`;

  const managementPlan = [
    confirmationStep,
    `Входить только внутри зоны ${entryFrom} - ${entryTo}; если цена ушла выше верхней границы без отката, сделку пропустить`,
    `Начальный стоп поставить на ${initialStopLoss}; это технический invalidation ниже поддержки/свинг-лоу, а не случайное число`,
    `TP1 (${tp1}) — первая фиксация 20-30% позиции; задача TP1 не “собрать максимум”, а снять первый риск`,
    `Переводить стоп в безубыток только после подтверждения: 1H закрытие выше TP1 или уверенный проход цены до ${breakEvenActivationPrice}`,
    `После подтвержденного TP1 стоп можно поднять в ${breakEvenPrice}`,
    `TP2 (${tp2}) — основная цель, там логично закрыть еще 40-50% позиции`,
    `Остаток вести к TP3 (${tp3}) или по trailing-stop ${trailingStopPercent}% (ориентир ${trailingStopAfterTp1})`,
    `Если цена закрывает 1H ниже ${initialStopLoss}, long-сценарий сломан и позицию надо закрывать без усреднения`,
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
    entryConfirmationStatus: item.entryConfirmationStatus,
    entryConfirmationStrategy: item.entryConfirmationStrategy,
    entryConfirmationText: item.entryConfirmationText,
    confirmationLevel: item.confirmationLevel,
    confirmationRetestLevel: item.confirmationRetestLevel,
    confirmationBreakoutLevel: item.confirmationBreakoutLevel,
    lastClosed1hCandleTime: item.lastClosed1hCandleTime,
    lastClosed1hCandleClose: item.lastClosed1hCandleClose,
    managementPlan,
  };
}

function buildNoBuyExplanation(summary: BuyMarketSummary): string {
  const reasons: string[] = [];

  if (summary.buyCount > 0) {
    return "На рынке есть пары, которые прошли staged scan, full validation и confirm-layer по закрытой 1H свече.";
  }

  if (summary.failedMarkets > 0) {
    reasons.push(`часть кандидатов не удалось доанализировать (${summary.failedMarkets})`);
  }

  if (
    summary.sidewaysCount >= summary.bullishCount &&
    summary.sidewaysCount >= summary.bearishCount
  ) {
    reasons.push("после полного анализа рынок в основном боковой");
  }

  if (summary.bearishCount > summary.bullishCount) {
    reasons.push("медвежьих сценариев больше, чем бычьих");
  }

  if (summary.avgChange30d !== null && summary.avgChange30d < 6) {
    reasons.push("средний месячный импульс слабый");
  }

  if (summary.avgRsi14 !== null && (summary.avgRsi14 > 66 || summary.avgRsi14 < 46)) {
    reasons.push("RSI по лучшим кандидатам уходит из рабочей зоны");
  }

  if (!reasons.length) {
    reasons.push(
      "кандидаты не проходят фильтры по 1D/4H тренду, качеству отката, room-to-resistance, confirm-layer по закрытой 1H свече и адекватному R/R"
    );
  }

  return reasons.join(", ");
}

function toSummary(
  totalSpotMarkets: number,
  stage2Candidates: number,
  scanResults: ScanItemResult[]
): BuyMarketSummary {
  const analyzedItems = scanResults
    .filter((item): item is Extract<ScanItemResult, { status: "ok" }> => item.status === "ok")
    .map((item) => item.evaluation);

  const failedItems = scanResults.filter(
    (item): item is Extract<ScanItemResult, { status: "failed" }> => item.status === "failed"
  );

  const buyCount = analyzedItems.filter((item) => item.signal === "BUY").length;
  const holdCount = analyzedItems.filter((item) => item.signal === "HOLD").length;
  const sellCount = analyzedItems.filter((item) => item.signal === "SELL").length;

  const bullishCount = analyzedItems.filter((item) => item.trend30d === "BULLISH").length;
  const sidewaysCount = analyzedItems.filter((item) => item.trend30d === "SIDEWAYS").length;
  const bearishCount = analyzedItems.filter((item) => item.trend30d === "BEARISH").length;

  const summary: BuyMarketSummary = {
    totalSpotMarkets,
    stage1Checked: totalSpotMarkets,
    stage2Candidates,
    totalChecked: totalSpotMarkets,
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
  const [markets, tickers, bookTickers] = await Promise.all([
    getAllPionexSpotMarkets(),
    getAllPionexSpotTickers(),
    getAllPionexSpotBookTickers(),
  ]);

  const stage1Candidates = buildStage1Candidates(markets, tickers, bookTickers);

  const scanResults = await mapWithConcurrency(
    stage1Candidates,
    2,
    async (candidate): Promise<ScanItemResult> => {
      try {
        const depth = await getPionexDepth(candidate.market.baseSymbol, candidate.market.quoteSymbol, 20);

        const marketContext = await buildMarketContext(candidate.market.baseSymbol, candidate.market.quoteSymbol, {
          ticker: candidate.ticker,
          bookTicker: candidate.bookTicker,
          depth,
        });

        const evaluation = evaluateMarketSignal(marketContext);

        if (!evaluation) {
          return {
            status: "failed",
            stage: "full",
            market: candidate.market,
            error: "Signal evaluation returned null",
          };
        }

        return {
          status: "ok",
          stage: "full",
          market: candidate.market,
          evaluation,
        };
      } catch (error) {
        return {
          status: "failed",
          stage: "full",
          market: candidate.market,
          error: normalizeErrorReason(error),
        };
      }
    }
  );

  const summary = toSummary(markets.length, stage1Candidates.length, scanResults);

  const buys: BuyCandidate[] = scanResults
    .filter((item): item is Extract<ScanItemResult, { status: "ok" }> => item.status === "ok")
    .map((item) => item.evaluation)
    .filter((item): item is RawEvaluation & { signal: "BUY" } => item.signal === "BUY")
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