import { MarketContext, TrendType } from "./market.service";

export type DeterministicSignal = "BUY" | "HOLD" | "SELL";

export type SignalEvaluation = {
  pair: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number | null;
  change30d: number | null;
  trend30d: TrendType;
  rsi14: number | null;
  high30d: number | null;
  low30d: number | null;
  sma7: number | null;
  sma30: number | null;
  rangePosition: number | null;
  pullbackFromHigh: number | null;
  score: number;
  signal: DeterministicSignal;
  reason: string;
  positives: string[];
  negatives: string[];
  regimeScore: number;
  setupScore: number;
  spaceScore: number;
  executionScore: number;
  atr1hUsd: number | null;
  atr1hPercent: number | null;
  nearestResistanceUsd: number | null;
  nextResistanceUsd: number | null;
  nearestSupportUsd: number | null;
  roomToResistancePercent: number | null;
  entryZoneLowUsd: number | null;
  entryZoneHighUsd: number | null;
  breakEvenActivationPriceUsd: number | null;
  trailingAtrMultiplier: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function getRangePosition(price: number, low: number | null, high: number | null): number | null {
  if (low === null || high === null || !Number.isFinite(low) || !Number.isFinite(high) || high <= low) {
    return null;
  }

  return clamp(((price - low) / (high - low)) * 100, 0, 100);
}

function getPullbackFromHigh(price: number, high: number | null): number | null {
  if (high === null || !Number.isFinite(high) || high <= 0 || price <= 0) {
    return null;
  }

  return ((high - price) / high) * 100;
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

export function evaluateMarketSignal(market: MarketContext): SignalEvaluation | null {
  const priceUsd = market.spot.priceUsd;
  const daily = market.technicals;
  const intraday1h = market.technicals.intraday1h;
  const intraday4h = market.technicals.intraday4h;
  const structure = market.technicals.structure;
  const execution = market.execution;

  if (!priceUsd || priceUsd <= 0) {
    return null;
  }

  const rangePosition = getRangePosition(priceUsd, daily.low30d, daily.high30d);
  const pullbackFromHigh = getPullbackFromHigh(priceUsd, daily.high30d);
  const atr1hUsd = intraday1h.atr14;
  const atr1hPercent = atr1hUsd && priceUsd > 0 ? (atr1hUsd / priceUsd) * 100 : null;

  const positives: string[] = [];
  const negatives: string[] = [];

  let regimeScore = 0;
  const regimeBullish =
    daily.trend30d === "BULLISH" &&
    daily.sma30 !== null &&
    priceUsd > daily.sma30 &&
    (daily.change30d ?? -999) >= 4;

  if (regimeBullish) {
    regimeScore += 28;
    positives.push("дневной режим рынка бычий и цена держится выше SMA30");
  } else if (daily.trend30d === "BEARISH") {
    regimeScore -= 20;
    negatives.push("дневной режим рынка медвежий");
  } else {
    regimeScore += 4;
    negatives.push("дневной режим рынка не дает сильного трендового преимущества");
  }

  if (daily.rsi14 !== null) {
    if (daily.rsi14 >= 48 && daily.rsi14 <= 64) {
      regimeScore += 8;
      positives.push("дневной RSI в здоровой зоне");
    } else if (daily.rsi14 > 70) {
      regimeScore -= 10;
      negatives.push("дневной RSI перегрет");
    } else if (daily.rsi14 < 42) {
      regimeScore -= 6;
      negatives.push("дневной RSI слабый для уверенного long");
    }
  }

  let setupScore = 0;
  const fourHourBullish =
    intraday4h.ema20 !== null &&
    intraday4h.ema50 !== null &&
    intraday4h.ema20 > intraday4h.ema50 &&
    priceUsd >= intraday4h.ema20;

  if (fourHourBullish) {
    setupScore += 18;
    positives.push("4H структура поддерживает продолжение вверх");
  } else {
    setupScore -= 14;
    negatives.push("4H структура не подтверждает сильный лонг-сетап");
  }

  const oneHourRsiOk = intraday1h.rsi14 !== null && intraday1h.rsi14 >= 48 && intraday1h.rsi14 <= 67;
  if (oneHourRsiOk) {
    setupScore += 8;
    positives.push("1H RSI не перегрет и остается в рабочей зоне");
  } else if (intraday1h.rsi14 !== null && intraday1h.rsi14 > 70) {
    setupScore -= 10;
    negatives.push("1H RSI перегрет возле входа");
  } else {
    setupScore -= 4;
    negatives.push("1H RSI не дает чистого входного триггера");
  }

  const volumeConfirmation = intraday1h.volumeRatio !== null && intraday1h.volumeRatio >= 1.08;
  if (volumeConfirmation) {
    setupScore += 8;
    positives.push("1H объем не ниже среднего и поддерживает сценарий");
  } else if (intraday1h.volumeRatio !== null && intraday1h.volumeRatio < 0.85) {
    setupScore -= 6;
    negatives.push("1H объем слабый, движение может быть пустым");
  }

  const pullbackToEma =
    intraday1h.ema20 !== null &&
    atr1hUsd !== null &&
    Math.abs(priceUsd - intraday1h.ema20) <= atr1hUsd * 0.9;

  if (pullbackToEma) {
    setupScore += 8;
    positives.push("цена стоит близко к 1H EMA20, вход не слишком растянут");
  } else if (intraday1h.ema20 !== null && atr1hUsd !== null && priceUsd > intraday1h.ema20 + atr1hUsd * 1.5) {
    setupScore -= 10;
    negatives.push("цена слишком далеко убежала от 1H EMA20");
  }

  let spaceScore = 0;
  const roomToResistancePercent = structure.roomToResistancePercent;
  const minimumRoomPercent = Math.max(atr1hPercent !== null ? atr1hPercent * 1.2 : 0, 1.8);

  if (roomToResistancePercent !== null && roomToResistancePercent >= minimumRoomPercent) {
    spaceScore += 22;
    positives.push("до ближайшего сопротивления есть рабочее пространство для TP1");
  } else {
    spaceScore -= 22;
    negatives.push("ближайшее сопротивление слишком близко, TP1 может быть нереалистичным");
  }

  if (rangePosition !== null) {
    if (rangePosition >= 35 && rangePosition <= 68) {
      spaceScore += 6;
      positives.push("цена находится в средней части диапазона, а не в зоне перегрева");
    } else if (rangePosition > 80) {
      spaceScore -= 10;
      negatives.push("цена слишком высоко в 30-дневном диапазоне");
    }
  }

  let executionScore = 0;
  if (execution.spreadPercent !== null) {
    if (execution.spreadPercent <= 0.15) {
      executionScore += 6;
      positives.push("спред узкий, исполнение выглядит комфортно");
    } else if (execution.spreadPercent > 0.35) {
      executionScore -= 8;
      negatives.push("спред расширен, исполнение может быть некачественным");
    }
  }

  if (execution.orderBookImbalance !== null) {
    if (execution.orderBookImbalance >= 0.08) {
      executionScore += 8;
      positives.push("в стакане есть перевес bid-side");
    } else if (execution.orderBookImbalance <= -0.08) {
      executionScore -= 10;
      negatives.push("в стакане перевес ask-side");
    }
  }

  if (execution.sellWallPressure !== null && execution.sellWallPressure > 1.35) {
    executionScore -= 8;
    negatives.push("над ценой заметно давление sell wall");
  }

  if (market.sentiment.socialDominanceLatest !== null && market.sentiment.socialDominanceLatest > 12) {
    executionScore -= 4;
    negatives.push("социальное доминирование повышено, толпа может быть перегрета");
  }

  const rawScore = regimeScore + setupScore + spaceScore + executionScore + 50;
  const score = clamp(round(rawScore), 0, 100);

  const hardBearish = daily.trend30d === "BEARISH" && (daily.change30d ?? 0) < -5;
  const buyAllowed = regimeBullish && fourHourBullish && roomToResistancePercent !== null && roomToResistancePercent >= minimumRoomPercent && score >= 68;

  const signal: DeterministicSignal = hardBearish ? "SELL" : buyAllowed ? "BUY" : "HOLD";

  const entryZoneLowUsd = intraday1h.ema20 !== null && atr1hUsd !== null
    ? Math.max(priceUsd - atr1hUsd * 0.35, intraday1h.ema20 - atr1hUsd * 0.25)
    : priceUsd * 0.995;
  const entryZoneHighUsd = intraday1h.ema20 !== null && atr1hUsd !== null
    ? Math.min(priceUsd, intraday1h.ema20 + atr1hUsd * 0.25)
    : priceUsd;

  const reason = signal === "BUY"
    ? [
        "buy разрешен только после проверки 1D режима, 4H структуры, 1H входа и пространства до сопротивления",
        `room до ближайшего сопротивления: ${formatNumber(roomToResistancePercent)}%`,
        `ATR 1H: ${formatNumber(atr1hPercent)}%`,
        `объем 1H к среднему: ${formatNumber(intraday1h.volumeRatio)}`
      ].join(", ")
    : signal === "SELL"
      ? "дневной режим рынка слабый, импульс отрицательный и long-сценарий ломается"
      : [
          "сигнал удержан в HOLD, потому что условия для качественного BUY не выполнены",
          `room до сопротивления: ${formatNumber(roomToResistancePercent)}%`,
          `минимально допустимо: ${formatNumber(minimumRoomPercent)}%`
        ].join(", ");

  return {
    pair: market.pair.display,
    symbol: market.asset.symbol,
    name: market.asset.name,
    priceUsd,
    change24h: market.spot.change24h,
    change30d: daily.change30d,
    trend30d: daily.trend30d,
    rsi14: daily.rsi14,
    high30d: daily.high30d,
    low30d: daily.low30d,
    sma7: daily.sma7,
    sma30: daily.sma30,
    rangePosition,
    pullbackFromHigh,
    score,
    signal,
    reason,
    positives,
    negatives,
    regimeScore: round(regimeScore),
    setupScore: round(setupScore),
    spaceScore: round(spaceScore),
    executionScore: round(executionScore),
    atr1hUsd,
    atr1hPercent,
    nearestResistanceUsd: structure.nearestResistanceUsd,
    nextResistanceUsd: structure.nextResistanceUsd,
    nearestSupportUsd: structure.nearestSupportUsd,
    roomToResistancePercent,
    entryZoneLowUsd,
    entryZoneHighUsd,
    breakEvenActivationPriceUsd: atr1hUsd !== null ? priceUsd + atr1hUsd * 1.3 : priceUsd * 1.013,
    trailingAtrMultiplier: 1.25,
  };
}