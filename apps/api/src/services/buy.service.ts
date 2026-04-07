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
import { BuyScanMode, evaluateMarketSignal } from "./signal.service";

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

export type RejectionBreakdownItem = {
  code: string;
  label: string;
  count: number;
  samplePairs: string[];
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
  stage1RejectionBreakdown: RejectionBreakdownItem[];
  stage2RejectionBreakdown: RejectionBreakdownItem[];
  stage3RejectionBreakdown: RejectionBreakdownItem[];
  scanMode: BuyScanMode;
};

export type BuyScanResult = {
  buys: BuyCandidate[];
  summary: BuyMarketSummary;
};

type Stage1Config = {
  mode: BuyScanMode;
  topSlicePercent: number;
  minCandidates: number;
  maxCandidates: number;
  idealChangeMin: number;
  idealChangeMax: number;
  extendedChangeMax: number;
  lowLiquidityAmount: number;
  mediumLiquidityAmount: number;
  highLiquidityAmount: number;
  spreadTight: number;
  spreadAcceptable: number;
  weakChangeReject: number;
  overheatedChangeReject: number;
  extremeIntradayRangeReject: number;
  lowScoreReject: number;
};

type Stage1Candidate = {
  market: PionexSpotMarket;
  ticker: PionexTicker;
  bookTicker: PionexBookTicker | null;
  stage1Score: number;
  spreadPercent: number | null;
};

type Stage1ScreenedMarket = {
  market: PionexSpotMarket;
  ticker: PionexTicker | null;
  bookTicker: PionexBookTicker | null;
  stage1Score: number;
  spreadPercent: number | null;
  intradayRangePercent: number | null;
  passedToStage2: boolean;
  primaryRejectCode: string | null;
  primaryRejectLabel: string | null;
};

function getStage1Config(mode: BuyScanMode): Stage1Config {
  if (mode === "soft") {
    return {
      mode,
      topSlicePercent: 0.28,
      minCandidates: 48,
      maxCandidates: 140,
      idealChangeMin: -4,
      idealChangeMax: 10,
      extendedChangeMax: 18,
      lowLiquidityAmount: 180_000,
      mediumLiquidityAmount: 800_000,
      highLiquidityAmount: 4_000_000,
      spreadTight: 0.16,
      spreadAcceptable: 0.28,
      weakChangeReject: -4,
      overheatedChangeReject: 18,
      extremeIntradayRangeReject: 18,
      lowScoreReject: 8,
    };
  }

  return {
    mode,
    topSlicePercent: 0.22,
    minCandidates: 40,
    maxCandidates: 120,
    idealChangeMin: -3,
    idealChangeMax: 8,
    extendedChangeMax: 15,
    lowLiquidityAmount: 250_000,
    mediumLiquidityAmount: 1_000_000,
    highLiquidityAmount: 5_000_000,
    spreadTight: 0.12,
    spreadAcceptable: 0.22,
    weakChangeReject: -3,
    overheatedChangeReject: 15,
    extremeIntradayRangeReject: 15,
    lowScoreReject: 12,
  };
}

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

function addBreakdownItem(
  bucketMap: Map<string, RejectionBreakdownItem>,
  code: string,
  label: string,
  pair: string
): void {
  const existing = bucketMap.get(code) ?? {
    code,
    label,
    count: 0,
    samplePairs: [],
  };

  existing.count += 1;

  if (existing.samplePairs.length < 3 && !existing.samplePairs.includes(pair)) {
    existing.samplePairs.push(pair);
  }

  bucketMap.set(code, existing);
}

function toSortedBreakdown(
  bucketMap: Map<string, RejectionBreakdownItem>
): RejectionBreakdownItem[] {
  return Array.from(bucketMap.values()).sort((a, b) => b.count - a.count);
}

function getPairLabel(market: PionexSpotMarket): string {
  return `${market.baseSymbol}/${market.quoteSymbol}`;
}

function getStage1PrimaryReject(
  ticker: PionexTicker | null,
  spreadPercent: number | null,
  intradayRangePercent: number | null,
  stage1Score: number,
  selectedForStage2: boolean,
  config: Stage1Config
): { code: string; label: string } | null {
  if (!ticker) {
    return {
      code: "STAGE1_NO_TICKER",
      label: "Нет ticker-данных для быстрого фильтра",
    };
  }

  if (selectedForStage2) {
    return null;
  }

  const change24h = ticker.changePercent24h;

  if (ticker.amount < config.lowLiquidityAmount) {
    return {
      code: "STAGE1_LOW_LIQUIDITY",
      label: `Слишком низкая ликвидность / объем для Stage 1 (${config.mode})`,
    };
  }

  if (spreadPercent !== null && spreadPercent > config.spreadAcceptable) {
    return {
      code: "STAGE1_WIDE_SPREAD",
      label: `Слишком широкий bid/ask spread для Stage 1 (${config.mode})`,
    };
  }

  if (change24h !== null && change24h < config.weakChangeReject) {
    return {
      code: "STAGE1_24H_TOO_WEAK",
      label: `Слишком слабое 24H движение для первичного отбора (${config.mode})`,
    };
  }

  if (change24h !== null && change24h > config.overheatedChangeReject) {
    return {
      code: "STAGE1_24H_OVERHEATED",
      label: `Слишком разогнанное 24H движение для первичного отбора (${config.mode})`,
    };
  }

  if (intradayRangePercent !== null && intradayRangePercent > config.extremeIntradayRangeReject) {
    return {
      code: "STAGE1_EXTREME_INTRADAY_RANGE",
      label: `Слишком экстремальный intraday range для Stage 1 (${config.mode})`,
    };
  }

  if (stage1Score < config.lowScoreReject) {
    return {
      code: "STAGE1_SCORE_TOO_LOW",
      label: `Слишком низкий суммарный Stage 1 score (${config.mode})`,
    };
  }

  return {
    code: "STAGE1_RANK_CUTOFF",
    label: `Не вошел в top-кандидаты после Stage 1 ranking (${config.mode})`,
  };
}

function buildStage1Screening(
  markets: PionexSpotMarket[],
  tickers: PionexTicker[],
  bookTickers: PionexBookTicker[],
  mode: BuyScanMode
): {
  candidates: Stage1Candidate[];
  screenedMarkets: Stage1ScreenedMarket[];
  rejectionBreakdown: RejectionBreakdownItem[];
} {
  const config = getStage1Config(mode);
  const tickerMap = new Map<string, PionexTicker>(tickers.map((item) => [item.symbol, item]));
  const bookTickerMap = new Map<string, PionexBookTicker>(
    bookTickers.map((item) => [item.symbol, item])
  );

  const screened: Stage1ScreenedMarket[] = [];

  for (const market of markets) {
    const ticker = tickerMap.get(market.symbol) ?? null;
    const bookTicker = bookTickerMap.get(market.symbol) ?? null;

    if (!ticker) {
      screened.push({
        market,
        ticker: null,
        bookTicker,
        stage1Score: -999,
        spreadPercent: null,
        intradayRangePercent: null,
        passedToStage2: false,
        primaryRejectCode: "STAGE1_NO_TICKER",
        primaryRejectLabel: "Нет ticker-данных для быстрого фильтра",
      });
      continue;
    }

    const spreadPercent =
      bookTicker && bookTicker.askPrice > 0
        ? ((bookTicker.askPrice - bookTicker.bidPrice) / bookTicker.askPrice) * 100
        : null;

    let score = 0;
    const change24h = ticker.changePercent24h;

    if (change24h !== null) {
      if (change24h >= config.idealChangeMin && change24h <= config.idealChangeMax) score += 12;
      else if (change24h > config.idealChangeMax && change24h <= config.extendedChangeMax) score += 4;
      else score -= 8;
    }

    if (ticker.amount > 0) {
      if (ticker.amount >= config.highLiquidityAmount) score += 14;
      else if (ticker.amount >= config.mediumLiquidityAmount) score += 10;
      else if (ticker.amount >= config.lowLiquidityAmount) score += 6;
      else score += 1;
    }

    if (spreadPercent !== null) {
      if (spreadPercent <= config.spreadTight) score += 10;
      else if (spreadPercent <= config.spreadAcceptable) score += 5;
      else score -= 10;
    }

    const intradayRangePercent =
      ticker.close > 0 ? ((ticker.high - ticker.low) / ticker.close) * 100 : null;

    if (intradayRangePercent !== null) {
      if (intradayRangePercent >= 1.2 && intradayRangePercent <= 10) {
        score += 6;
      } else if (intradayRangePercent > config.extremeIntradayRangeReject) {
        score -= 8;
      }
    }

    screened.push({
      market,
      ticker,
      bookTicker,
      stage1Score: score,
      spreadPercent,
      intradayRangePercent,
      passedToStage2: false,
      primaryRejectCode: null,
      primaryRejectLabel: null,
    });
  }

  const ranked = screened
    .filter((item): item is Stage1ScreenedMarket & { ticker: PionexTicker } => item.ticker !== null)
    .sort((a, b) => b.stage1Score - a.stage1Score);

  const dynamicLimit = Math.max(
    config.minCandidates,
    Math.min(config.maxCandidates, Math.ceil(ranked.length * config.topSlicePercent))
  );
  const selectedSymbols = new Set(ranked.slice(0, dynamicLimit).map((item) => item.market.symbol));

  for (const item of screened) {
    const selected = selectedSymbols.has(item.market.symbol);
    item.passedToStage2 = selected;

    const reject = getStage1PrimaryReject(
      item.ticker,
      item.spreadPercent,
      item.intradayRangePercent,
      item.stage1Score,
      selected,
      config
    );

    item.primaryRejectCode = reject?.code ?? null;
    item.primaryRejectLabel = reject?.label ?? null;
  }

  const stage1Buckets = new Map<string, RejectionBreakdownItem>();

  for (const item of screened) {
    if (item.passedToStage2) {
      continue;
    }

    if (item.primaryRejectCode && item.primaryRejectLabel) {
      addBreakdownItem(
        stage1Buckets,
        item.primaryRejectCode,
        item.primaryRejectLabel,
        getPairLabel(item.market)
      );
    }
  }

  const candidates: Stage1Candidate[] = screened
    .filter(
      (item): item is Stage1ScreenedMarket & { ticker: PionexTicker } =>
        item.passedToStage2 && item.ticker !== null
    )
    .sort((a, b) => b.stage1Score - a.stage1Score)
    .map((item) => ({
      market: item.market,
      ticker: item.ticker,
      bookTicker: item.bookTicker,
      stage1Score: item.stage1Score,
      spreadPercent: item.spreadPercent,
    }));

  return {
    candidates,
    screenedMarkets: screened,
    rejectionBreakdown: toSortedBreakdown(stage1Buckets),
  };
}

function isStage3ConfirmationRefusal(item: RawEvaluation): boolean {
  if (item.signal !== "HOLD") {
    return false;
  }

  if (item.entryConfirmationStatus === "CONFIRMED") {
    return false;
  }

  const roomFailed =
    item.roomToResistancePercent !== null &&
    item.minimumRoomPercent !== null &&
    item.roomToResistancePercent < item.minimumRoomPercent &&
    !(item.scanMode === "soft" && item.roomToResistancePercent >= item.minimumRoomPercent * 0.92);

  const stopFailed =
    item.stopDistancePercent !== null &&
    (item.stopDistancePercent < item.stopMin || item.stopDistancePercent > item.stopMax);

  const riskRewardFailed =
    item.target1DistancePercent !== null &&
    item.stopDistancePercent !== null &&
    item.target1DistancePercent / Math.max(item.stopDistancePercent, 0.0001) < item.rrMin;

  const overheated =
    (item.rsi14 !== null && item.rsi14 > item.hardRejectOneHourRsi) ||
    (item.pullbackFromHigh !== null && item.pullbackFromHigh < item.hardRejectPullbackFromHigh);

  const weakRegime = item.trend30d === "BEARISH" || item.regimeScore <= -20;
  const brokenSetup = item.setupScore <= -18;

  return !roomFailed && !stopFailed && !riskRewardFailed && !overheated && !weakRegime && !brokenSetup;
}

function classifyStage2RejectedEvaluation(item: RawEvaluation): { code: string; label: string } | null {
  if (item.signal === "BUY") {
    return null;
  }

  if (isStage3ConfirmationRefusal(item)) {
    return null;
  }

  if (item.signal === "SELL") {
    return {
      code: "STAGE2_SELL_BEARISH_REGIME",
      label: `Медвежий режим: full-analysis перевел рынок в SELL (${item.scanMode})`,
    };
  }

  if (item.trend30d === "BEARISH" || item.regimeScore <= -20) {
    return {
      code: "STAGE2_DAILY_BEARISH_OR_WEAK",
      label: `Слабый или медвежий дневной режим на full-analysis (${item.scanMode})`,
    };
  }

  if (item.setupScore <= -18) {
    return {
      code: "STAGE2_FOUR_H_OR_ONE_H_STRUCTURE_FAILED",
      label: `4H/1H структура не прошла full-analysis (${item.scanMode})`,
    };
  }

  if (
    item.roomToResistancePercent !== null &&
    item.minimumRoomPercent !== null &&
    item.roomToResistancePercent < item.minimumRoomPercent &&
    !(item.scanMode === "soft" && item.roomToResistancePercent >= item.minimumRoomPercent * 0.92)
  ) {
    return {
      code: "STAGE2_NOT_ENOUGH_ROOM_TO_RESISTANCE",
      label: `Недостаточно room до ближайшего сопротивления (${item.scanMode})`,
    };
  }

  if (
    item.stopDistancePercent !== null &&
    (item.stopDistancePercent < item.stopMin || item.stopDistancePercent > item.stopMax)
  ) {
    return {
      code: "STAGE2_STOP_DISTANCE_INVALID",
      label: `Стоп слишком узкий или слишком широкий (${item.scanMode})`,
    };
  }

  if (
    item.target1DistancePercent !== null &&
    item.stopDistancePercent !== null &&
    item.target1DistancePercent / Math.max(item.stopDistancePercent, 0.0001) < item.rrMin
  ) {
    return {
      code: "STAGE2_RISK_REWARD_TOO_WEAK",
      label: `Слабое R/R до первой цели (${item.scanMode})`,
    };
  }

  if (
    (item.rsi14 !== null && item.rsi14 > item.hardRejectOneHourRsi) ||
    (item.pullbackFromHigh !== null && item.pullbackFromHigh < item.hardRejectPullbackFromHigh)
  ) {
    return {
      code: "STAGE2_OVERHEATED_OR_LATE_ENTRY",
      label: `Монета перегрета или вход слишком поздний (${item.scanMode})`,
    };
  }

  if (item.score < item.stage2StaticScoreMin) {
    return {
      code: "STAGE2_STATIC_SCORE_TOO_LOW",
      label: `Static setup не набрал проходной score (${item.scanMode})`,
    };
  }

  return {
    code: "STAGE2_OTHER_STATIC_REJECTION",
    label: `Прочие причины отказа на full-analysis (${item.scanMode})`,
  };
}

function classifyStage3RejectedEvaluation(item: RawEvaluation): { code: string; label: string } | null {
  if (!isStage3ConfirmationRefusal(item)) {
    return null;
  }

  if (item.entryConfirmationStatus === "WAITING_BREAKOUT_RETEST") {
    return {
      code: "STAGE3_WAITING_BREAKOUT_RETEST",
      label: `Ждет breakout-retest подтверждение по закрытой 1H свече (${item.scanMode})`,
    };
  }

  if (item.entryConfirmationStatus === "WAITING_RETEST") {
    return {
      code: "STAGE3_WAITING_RETEST",
      label: `Ждет retest и закрытие 1H обратно вверх (${item.scanMode})`,
    };
  }

  if (item.entryConfirmationStatus === "WAITING_1H_CLOSE") {
    return {
      code: "STAGE3_WAITING_1H_CLOSE",
      label: `Ждет подтвержденный 1H close выше trigger-level (${item.scanMode})`,
    };
  }

  if (item.entryConfirmationStatus === "NO_DATA") {
    return {
      code: "STAGE3_NO_CONFIRMATION_DATA",
      label: `Недостаточно закрытых 1H candle-данных для confirm-layer (${item.scanMode})`,
    };
  }

  return {
    code: "STAGE3_OTHER_CONFIRMATION_REJECTION",
    label: `Прочие причины отказа на confirm-layer (${item.scanMode})`,
  };
}

function buildStage2AndStage3Breakdown(scanResults: ScanItemResult[]): {
  stage2Breakdown: RejectionBreakdownItem[];
  stage3Breakdown: RejectionBreakdownItem[];
} {
  const stage2Buckets = new Map<string, RejectionBreakdownItem>();
  const stage3Buckets = new Map<string, RejectionBreakdownItem>();

  for (const item of scanResults) {
    if (item.status === "failed") {
      addBreakdownItem(
        stage2Buckets,
        "STAGE2_FULL_ANALYSIS_ERROR",
        "Ошибка полного анализа / buildMarketContext / signal evaluation",
        getPairLabel(item.market)
      );
      continue;
    }

    const stage3Reject = classifyStage3RejectedEvaluation(item.evaluation);
    if (stage3Reject) {
      addBreakdownItem(
        stage3Buckets,
        stage3Reject.code,
        stage3Reject.label,
        item.evaluation.pair
      );
      continue;
    }

    const stage2Reject = classifyStage2RejectedEvaluation(item.evaluation);
    if (stage2Reject) {
      addBreakdownItem(
        stage2Buckets,
        stage2Reject.code,
        stage2Reject.label,
        item.evaluation.pair
      );
    }
  }

  return {
    stage2Breakdown: toSortedBreakdown(stage2Buckets),
    stage3Breakdown: toSortedBreakdown(stage3Buckets),
  };
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
  const trailingStopPercent = Number(
    clamp(atrPercent * item.trailingAtrMultiplier, 2.2, 5.6).toFixed(2)
  );

  const trailingStopAfterTp1 = round(
    Math.max(breakEvenPrice, tp1 * (1 - trailingStopPercent / 100))
  );

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
    return `На рынке есть пары, которые прошли staged scan, full validation и confirm-layer по закрытой 1H свече в режиме ${summary.scanMode}.`;
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
      `кандидаты не проходят фильтры по 1D/4H тренду, качеству отката, room-to-resistance, confirm-layer по закрытой 1H свече и адекватному R/R в режиме ${summary.scanMode}`
    );
  }

  return reasons.join(", ");
}

function toSummary(
  totalSpotMarkets: number,
  stage2Candidates: number,
  scanResults: ScanItemResult[],
  stage1RejectionBreakdown: RejectionBreakdownItem[],
  scanMode: BuyScanMode
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

  const { stage2Breakdown, stage3Breakdown } = buildStage2AndStage3Breakdown(scanResults);

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
      pair: getPairLabel(item.market),
      reason: item.error,
    })),
    stage1RejectionBreakdown,
    stage2RejectionBreakdown: stage2Breakdown,
    stage3RejectionBreakdown: stage3Breakdown,
    scanMode,
  };

  summary.explanation = buildNoBuyExplanation(summary);
  return summary;
}

export async function getBuyScanResult(limit = 10, mode: BuyScanMode = "hard"): Promise<BuyScanResult> {
  const [markets, tickers, bookTickers] = await Promise.all([
    getAllPionexSpotMarkets(),
    getAllPionexSpotTickers(),
    getAllPionexSpotBookTickers(),
  ]);

  const stage1 = buildStage1Screening(markets, tickers, bookTickers, mode);
  const stage1Candidates = stage1.candidates;

  const scanResults = await mapWithConcurrency(
    stage1Candidates,
    2,
    async (candidate): Promise<ScanItemResult> => {
      try {
        const depth = await getPionexDepth(
          candidate.market.baseSymbol,
          candidate.market.quoteSymbol,
          20
        );

        const marketContext = await buildMarketContext(
          candidate.market.baseSymbol,
          candidate.market.quoteSymbol,
          {
            ticker: candidate.ticker,
            bookTicker: candidate.bookTicker,
            depth,
          }
        );

        const evaluation = evaluateMarketSignal(marketContext, mode);

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

  const summary = toSummary(
    markets.length,
    stage1Candidates.length,
    scanResults,
    stage1.rejectionBreakdown,
    mode
  );

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