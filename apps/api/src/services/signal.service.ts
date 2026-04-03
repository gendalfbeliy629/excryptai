import { MarketContext, OHLCItem, TrendType } from "./market.service";

export type DeterministicSignal = "BUY" | "HOLD" | "SELL";
export type EntryConfirmationStatus =
  | "CONFIRMED"
  | "WAITING_1H_CLOSE"
  | "WAITING_RETEST"
  | "WAITING_BREAKOUT_RETEST"
  | "NO_DATA";

export type EntryConfirmationStrategy =
  | "1H_CANDLE_CLOSE"
  | "1H_RETEST"
  | "1H_BREAKOUT_RETEST"
  | "NONE";

type EntryConfirmation = {
  status: EntryConfirmationStatus;
  strategy: EntryConfirmationStrategy;
  scoreDelta: number;
  confirmationText: string;
  confirmationLevel: number | null;
  retestLevel: number | null;
  breakoutLevel: number | null;
  lastClosedCandleTime: number | null;
  lastClosedCandleClose: number | null;
};

export type SignalEvaluation = {
  pair: string;
  symbol: string;
  quoteSymbol: string;
  name: string;
  price: number;
  priceUsd: number | null;
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
  riskScore: number;
  confirmationScore: number;
  atr1h: number | null;
  atr1hPercent: number | null;
  nearestResistance: number | null;
  nextResistance: number | null;
  nearestSupport: number | null;
  secondarySupport: number | null;
  roomToResistancePercent: number | null;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  breakEvenActivationPrice: number | null;
  trailingAtrMultiplier: number;
  protectiveStop: number | null;
  invalidationLevel: number | null;
  pullbackBuyZoneDistancePercent: number | null;
  stopDistancePercent: number | null;
  target1DistancePercent: number | null;
  minimumRoomPercent: number | null;
  entryConfirmationStatus: EntryConfirmationStatus;
  entryConfirmationStrategy: EntryConfirmationStrategy;
  entryConfirmationText: string;
  confirmationLevel: number | null;
  confirmationRetestLevel: number | null;
  confirmationBreakoutLevel: number | null;
  lastClosed1hCandleTime: number | null;
  lastClosed1hCandleClose: number | null;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function formatNumber(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function percentDiff(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) return null;
  return ((to - from) / from) * 100;
}

function getRangePosition(price: number, low: number | null, high: number | null): number | null {
  if (
    low === null ||
    high === null ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    high <= low
  ) {
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

function getCandleBodyPercent(candle: OHLCItem | null | undefined): number | null {
  if (!candle || candle.close <= 0) return null;
  return (Math.abs(candle.close - candle.open) / candle.close) * 100;
}

function evaluateEntryConfirmation(params: {
  candles1h: OHLCItem[];
  price: number;
  atr1h: number | null;
  entryZoneLow: number;
  entryZoneHigh: number;
  nearestResistance: number | null;
  ema20: number | null;
  recentSwingHigh: number | null;
  volumeRatio: number | null;
}): EntryConfirmation {
  const {
    candles1h,
    price,
    atr1h,
    entryZoneLow,
    entryZoneHigh,
    nearestResistance,
    ema20,
    recentSwingHigh,
    volumeRatio,
  } = params;

  const closedCandles = candles1h.slice(0, -1);
  const latestClosed = closedCandles.length ? closedCandles[closedCandles.length - 1] : null;
  const previousClosed = closedCandles.length > 1 ? closedCandles[closedCandles.length - 2] : null;

  if (!latestClosed || !previousClosed) {
    return {
      status: "NO_DATA",
      strategy: "NONE",
      scoreDelta: -12,
      confirmationText: "нет достаточного количества закрытых 1H свечей для подтверждения входа",
      confirmationLevel: entryZoneHigh,
      retestLevel: entryZoneLow,
      breakoutLevel: nearestResistance ?? recentSwingHigh,
      lastClosedCandleTime: latestClosed?.time ?? null,
      lastClosedCandleClose: latestClosed?.close ?? null,
    };
  }

  const atr = atr1h ?? price * 0.01;
  const bodyPercent = getCandleBodyPercent(latestClosed) ?? 0;
  const breakoutLevel = nearestResistance ?? recentSwingHigh;
  const retestLevel = Math.max(entryZoneLow, ema20 ?? entryZoneLow);
  const triggerLevel = Math.max(entryZoneHigh, ema20 ?? entryZoneHigh);

  const volumeConfirmed = volumeRatio === null || volumeRatio >= 0.98;
  const strongCloseAboveTrigger =
    latestClosed.close >= triggerLevel &&
    latestClosed.close > latestClosed.open &&
    latestClosed.close >= latestClosed.low + (latestClosed.high - latestClosed.low) * 0.6 &&
    bodyPercent >= Math.max(0.18, ((atr / Math.max(price, 0.00000001)) * 100) * 0.2) &&
    volumeConfirmed;

  const retestTolerance = Math.max(atr * 0.22, price * 0.0018);
  const retestHoldConfirmed =
    latestClosed.low <= retestLevel + retestTolerance &&
    latestClosed.close > retestLevel &&
    latestClosed.close >= triggerLevel * 0.998 &&
    latestClosed.close > latestClosed.open &&
    previousClosed.close >= triggerLevel * 0.996;

  const breakoutRetestTolerance = Math.max(atr * 0.28, price * 0.0022);
  const breakoutWasActive =
    breakoutLevel !== null &&
    previousClosed.close > breakoutLevel &&
    previousClosed.high >= breakoutLevel;

  const breakoutRetestConfirmed =
    breakoutLevel !== null &&
    breakoutWasActive &&
    latestClosed.low <= breakoutLevel + breakoutRetestTolerance &&
    latestClosed.close > breakoutLevel &&
    latestClosed.close > latestClosed.open;

  if (breakoutRetestConfirmed) {
    return {
      status: "CONFIRMED",
      strategy: "1H_BREAKOUT_RETEST",
      scoreDelta: 12,
      confirmationText: `вход подтвержден сценарием breakout-retest: предыдущая 1H свеча закрепилась выше ${formatNumber(
        breakoutLevel
      )}, последняя закрытая свеча удержала ретест`,
      confirmationLevel: breakoutLevel,
      retestLevel: breakoutLevel,
      breakoutLevel,
      lastClosedCandleTime: latestClosed.time,
      lastClosedCandleClose: latestClosed.close,
    };
  }

  if (retestHoldConfirmed) {
    return {
      status: "CONFIRMED",
      strategy: "1H_RETEST",
      scoreDelta: 10,
      confirmationText: `вход подтвержден retest-сценарием: последняя закрытая 1H свеча протестировала ${formatNumber(
        retestLevel
      )} и закрылась обратно выше зоны входа`,
      confirmationLevel: triggerLevel,
      retestLevel,
      breakoutLevel,
      lastClosedCandleTime: latestClosed.time,
      lastClosedCandleClose: latestClosed.close,
    };
  }

  if (strongCloseAboveTrigger) {
    return {
      status: "CONFIRMED",
      strategy: "1H_CANDLE_CLOSE",
      scoreDelta: 8,
      confirmationText: `вход подтвержден: последняя закрытая 1H свеча уверенно закрылась выше ${formatNumber(
        triggerLevel
      )}`,
      confirmationLevel: triggerLevel,
      retestLevel,
      breakoutLevel,
      lastClosedCandleTime: latestClosed.time,
      lastClosedCandleClose: latestClosed.close,
    };
  }

  if (breakoutWasActive && breakoutLevel !== null && latestClosed.low > breakoutLevel) {
    return {
      status: "WAITING_BREAKOUT_RETEST",
      strategy: "NONE",
      scoreDelta: -9,
      confirmationText: `базовый breakout уже есть, но профессиональный вход ждет 1H retest уровня ${formatNumber(
        breakoutLevel
      )} и закрытие обратно выше него`,
      confirmationLevel: breakoutLevel,
      retestLevel: breakoutLevel,
      breakoutLevel,
      lastClosedCandleTime: latestClosed.time,
      lastClosedCandleClose: latestClosed.close,
    };
  }

  if (latestClosed.close >= triggerLevel * 0.996 && latestClosed.low > retestLevel + retestTolerance) {
    return {
      status: "WAITING_RETEST",
      strategy: "NONE",
      scoreDelta: -10,
      confirmationText: `структура почти готова, но нужен 1H retest зоны ${formatNumber(
        retestLevel
      )} с удержанием и закрытием обратно выше ${formatNumber(triggerLevel)}`,
      confirmationLevel: triggerLevel,
      retestLevel,
      breakoutLevel,
      lastClosedCandleTime: latestClosed.time,
      lastClosedCandleClose: latestClosed.close,
    };
  }

  return {
    status: "WAITING_1H_CLOSE",
    strategy: "NONE",
    scoreDelta: -12,
    confirmationText: `нет подтвержденного 1H close выше ${formatNumber(
      triggerLevel
    )}; вход разрешается только после закрытия часа или retest / breakout-retest сценария`,
    confirmationLevel: triggerLevel,
    retestLevel,
    breakoutLevel,
    lastClosedCandleTime: latestClosed.time,
    lastClosedCandleClose: latestClosed.close,
  };
}

export function evaluateMarketSignal(market: MarketContext): SignalEvaluation | null {
  const price = market.spot.price;
  const daily = market.technicals;
  const intraday1h = daily.intraday1h;
  const intraday4h = daily.intraday4h;
  const structure = daily.structure;
  const execution = market.execution;

  if (!price || price <= 0) {
    return null;
  }

  const rangePosition = getRangePosition(price, daily.low30d, daily.high30d);
  const pullbackFromHigh = getPullbackFromHigh(price, daily.high30d);
  const atr1h = intraday1h.atr14;
  const atr1hPercent = atr1h && price > 0 ? (atr1h / price) * 100 : null;

  const positives: string[] = [];
  const negatives: string[] = [];

  const dailyBullTrend =
    daily.trend30d === "BULLISH" &&
    daily.sma30 !== null &&
    daily.ema20 !== null &&
    price > daily.sma30 &&
    price > daily.ema20 &&
    (daily.change30d ?? -999) >= 6;

  const fourHourBullTrend =
    intraday4h.ema20 !== null &&
    intraday4h.ema50 !== null &&
    intraday4h.ema20 > intraday4h.ema50 &&
    price >= intraday4h.ema20;

  const oneHourBullStructure =
    intraday1h.ema20 !== null &&
    intraday1h.ema50 !== null &&
    intraday1h.ema20 >= intraday1h.ema50 &&
    price >= intraday1h.ema20 * 0.9975;

  const priceToSupportPercent =
    structure.nearestSupport !== null ? percentDiff(structure.nearestSupport, price) : null;

  const pullbackBuyZoneDistancePercent =
    intraday1h.ema20 !== null ? Math.abs(((price - intraday1h.ema20) / intraday1h.ema20) * 100) : null;

  const protectiveStop =
    atr1h !== null
      ? Math.min(
          structure.nearestSupport !== null
            ? structure.nearestSupport - atr1h * 0.65
            : price - atr1h * 1.25,
          intraday1h.recentSwingLow !== null
            ? intraday1h.recentSwingLow - atr1h * 0.35
            : price - atr1h * 1.25
        )
      : structure.nearestSupport !== null
        ? structure.nearestSupport * 0.992
        : price * 0.985;

  const invalidationLevel = protectiveStop;
  const stopDistancePercent = percentDiff(price, protectiveStop);

  const rawTarget1 =
    structure.nearestResistance !== null && atr1h !== null
      ? structure.nearestResistance - atr1h * 0.35
      : structure.nearestResistance ?? (atr1h !== null ? price + atr1h * 1.6 : price * 1.018);

  const target1DistancePercent = percentDiff(price, rawTarget1);
  const minimumRoomPercent = Math.max(
    atr1hPercent !== null ? atr1hPercent * 1.7 : 0,
    stopDistancePercent !== null ? stopDistancePercent * 1.85 : 0,
    4.2
  );

  let regimeScore = 0;
  if (dailyBullTrend) {
    regimeScore += 22;
    positives.push("дневной тренд направлен вверх: цена выше EMA20/SMA30 и месячный импульс положительный");
  } else if (daily.trend30d === "BEARISH") {
    regimeScore -= 24;
    negatives.push("дневной режим рынка медвежий");
  } else {
    regimeScore -= 4;
    negatives.push("дневной тренд недостаточно сильный для уверенного long");
  }

  if (daily.rsi14 !== null) {
    if (daily.rsi14 >= 50 && daily.rsi14 <= 62) {
      regimeScore += 8;
      positives.push("дневной RSI в рабочей зоне без перегрева");
    } else if (daily.rsi14 > 68) {
      regimeScore -= 14;
      negatives.push("дневной RSI перегрет, вход после сильного разгона опасен");
    } else if (daily.rsi14 < 46) {
      regimeScore -= 8;
      negatives.push("дневной RSI слабый для качественного long");
    }
  }

  if (daily.adx14 !== null) {
    if (daily.adx14 >= 18) {
      regimeScore += 6;
      positives.push("дневной ADX подтверждает наличие тренда");
    } else {
      regimeScore -= 4;
      negatives.push("дневной ADX слабый, тренд может быть рыхлым");
    }
  }

  if (daily.macdHistogram !== null) {
    if (daily.macdHistogram > 0) {
      regimeScore += 6;
      positives.push("дневной MACD остается на стороне покупателей");
    } else {
      regimeScore -= 6;
      negatives.push("дневной MACD не поддерживает long");
    }
  }

  let setupScore = 0;
  if (fourHourBullTrend) {
    setupScore += 18;
    positives.push("4H структура бычья: EMA20 выше EMA50 и цена удерживает трендовую зону");
  } else {
    setupScore -= 18;
    negatives.push("4H структура не подтверждает продолжение вверх");
  }

  if (intraday4h.rsi14 !== null) {
    if (intraday4h.rsi14 >= 50 && intraday4h.rsi14 <= 66) {
      setupScore += 6;
      positives.push("4H RSI в рабочей зоне");
    } else if (intraday4h.rsi14 > 70) {
      setupScore -= 8;
      negatives.push("4H RSI перегрет");
    }
  }

  if (intraday4h.adx14 !== null) {
    if (intraday4h.adx14 >= 18) {
      setupScore += 6;
      positives.push("4H ADX подтверждает направленное движение");
    } else {
      setupScore -= 4;
      negatives.push("4H ADX слабый, тренд может не дотянуть до целей");
    }
  }

  if (oneHourBullStructure) {
    setupScore += 12;
    positives.push("1H цена держится над EMA20 и не ломает входную структуру");
  } else {
    setupScore -= 14;
    negatives.push("1H структура входа сломана или уже теряет EMA20");
  }

  if (intraday1h.rsi14 !== null) {
    if (intraday1h.rsi14 >= 48 && intraday1h.rsi14 <= 62) {
      setupScore += 10;
      positives.push("1H RSI подходит для входа после отката, а не на пике");
    } else if (intraday1h.rsi14 > 66) {
      setupScore -= 12;
      negatives.push("1H RSI перегрет возле точки входа");
    } else if (intraday1h.rsi14 < 44) {
      setupScore -= 8;
      negatives.push("1H RSI слишком слабый, импульс может гаснуть");
    }
  }

  if (intraday1h.macdHistogram !== null) {
    if (intraday1h.macdHistogram > 0) {
      setupScore += 6;
      positives.push("1H MACD показывает восстановление импульса вверх");
    } else {
      setupScore -= 6;
      negatives.push("1H MACD еще не развернулся в buy-side");
    }
  }

  if (pullbackBuyZoneDistancePercent !== null) {
    if (pullbackBuyZoneDistancePercent <= 1.8) {
      setupScore += 8;
      positives.push("цена не слишком растянута от 1H EMA20");
    } else if (pullbackBuyZoneDistancePercent > 3.4) {
      setupScore -= 10;
      negatives.push("цена слишком далеко от 1H EMA20, высок риск запоздалого входа");
    }
  }

  if (intraday1h.volumeRatio !== null) {
    if (intraday1h.volumeRatio >= 1.05) {
      setupScore += 7;
      positives.push("1H объем не ниже среднего и поддерживает вход");
    } else if (intraday1h.volumeRatio < 0.9) {
      setupScore -= 7;
      negatives.push("1H объем слабый, движение может быстро затухнуть");
    }
  }

  let spaceScore = 0;
  if (
    structure.roomToResistancePercent !== null &&
    structure.roomToResistancePercent >= minimumRoomPercent
  ) {
    spaceScore += 20;
    positives.push("до ближайшего сопротивления хватает пространства для первой цели");
  } else {
    spaceScore -= 22;
    negatives.push("до ближайшего сопротивления мало места относительно риска");
  }

  if (rangePosition !== null) {
    if (rangePosition >= 35 && rangePosition <= 68) {
      spaceScore += 8;
      positives.push("цена находится в рабочей части 30-дневного диапазона");
    } else if (rangePosition > 76) {
      spaceScore -= 12;
      negatives.push("цена слишком высоко в 30-дневном диапазоне — это часто запоздалый вход");
    }
  }

  if (pullbackFromHigh !== null) {
    if (pullbackFromHigh >= 6 && pullbackFromHigh <= 18) {
      spaceScore += 8;
      positives.push("есть здоровый откат от локального максимума, вход не на самом пике");
    } else if (pullbackFromHigh < 4) {
      spaceScore -= 12;
      negatives.push("цена почти у максимума месяца, риск купить вершину высокий");
    } else if (pullbackFromHigh > 22) {
      spaceScore -= 6;
      negatives.push("откат слишком глубокий, структура может уже слабеть");
    }
  }

  let executionScore = 0;
  if (execution.spreadPercent !== null) {
    if (execution.spreadPercent <= 0.15) {
      executionScore += 6;
      positives.push("спред узкий, исполнение комфортное");
    } else if (execution.spreadPercent > 0.28) {
      executionScore -= 8;
      negatives.push("спред расширен, реальная цена входа может ухудшиться");
    }
  }

  if (execution.orderBookImbalance !== null) {
    if (execution.orderBookImbalance >= 0.1) {
      executionScore += 8;
      positives.push("в стакане есть перевес bid-side");
    } else if (execution.orderBookImbalance <= -0.05) {
      executionScore -= 10;
      negatives.push("в стакане перевес ask-side");
    }
  }

  if (execution.sellWallPressure !== null && execution.sellWallPressure > 1.2) {
    executionScore -= 8;
    negatives.push("над ценой заметна sell wall, пробой сопротивления может не состояться");
  }

  if (
    market.sentiment.socialDominanceLatest !== null &&
    market.sentiment.socialDominanceLatest > 12
  ) {
    executionScore -= 3;
    negatives.push("социальное доминирование повышено, толпа может быть перегрета");
  }

  let riskScore = 0;
  if (stopDistancePercent !== null) {
    if (stopDistancePercent >= 2.2 && stopDistancePercent <= 4.8) {
      riskScore += 12;
      positives.push("стоп достаточно глубокий, чтобы пережить обычный шум, но еще контролируемый");
    } else if (stopDistancePercent < 1.8) {
      riskScore -= 12;
      negatives.push("стоп слишком близкий, обычный рыночный шум может выбить позицию");
    } else if (stopDistancePercent > 5.4) {
      riskScore -= 10;
      negatives.push("стоп слишком широкий, сделка становится неэффективной по риску");
    }
  }

  if (target1DistancePercent !== null && stopDistancePercent !== null) {
    const rr = target1DistancePercent / Math.max(stopDistancePercent, 0.0001);
    if (rr >= 1.8) {
      riskScore += 12;
      positives.push("первая цель дает приемлемое соотношение риск/доходность");
    } else {
      riskScore -= 14;
      negatives.push("первая цель слишком близка относительно стопа");
    }
  }

  if ((daily.change30d ?? 0) > 95 && (daily.rsi14 ?? 0) > 67) {
    riskScore -= 16;
    negatives.push("монета уже слишком сильно разогнана за 30 дней — лучше ждать новый базовый откат");
  }

  if ((market.spot.change24h ?? 0) <= -2.5 && !oneHourBullStructure) {
    riskScore -= 10;
    negatives.push("24ч импульс отрицательный и 1H структура уже не держится");
  }

  const entryZoneLow =
    intraday1h.ema20 !== null && atr1h !== null
      ? Math.max(
          structure.nearestSupport !== null ? structure.nearestSupport + atr1h * 0.15 : price - atr1h * 0.7,
          intraday1h.ema20 - atr1h * 0.35,
          intraday1h.bbLower20 !== null ? intraday1h.bbLower20 * 1.004 : 0
        )
      : price * 0.992;

  const entryZoneHigh =
    intraday1h.ema20 !== null && atr1h !== null
      ? Math.min(price, intraday1h.ema20 + atr1h * 0.18)
      : price;

  const confirmation = evaluateEntryConfirmation({
    candles1h: intraday1h.candles,
    price,
    atr1h,
    entryZoneLow,
    entryZoneHigh,
    nearestResistance: structure.nearestResistance,
    ema20: intraday1h.ema20,
    recentSwingHigh: intraday1h.recentSwingHigh,
    volumeRatio: intraday1h.volumeRatio,
  });

  const confirmationScore = confirmation.scoreDelta;
  if (confirmation.status === "CONFIRMED") {
    positives.push(confirmation.confirmationText);
  } else {
    negatives.push(confirmation.confirmationText);
  }

  const rawScore =
    regimeScore + setupScore + spaceScore + executionScore + riskScore + confirmationScore + 45;
  const score = clamp(round(rawScore), 0, 100);

  const hardBearish = daily.trend30d === "BEARISH" && (daily.change30d ?? 0) < -5;

  const hardReject =
    !dailyBullTrend ||
    !fourHourBullTrend ||
    !oneHourBullStructure ||
    (daily.rsi14 !== null && daily.rsi14 > 68) ||
    (intraday1h.rsi14 !== null && intraday1h.rsi14 > 66) ||
    (intraday4h.adx14 !== null && intraday4h.adx14 < 16) ||
    (pullbackFromHigh !== null && pullbackFromHigh < 4) ||
    (structure.roomToResistancePercent !== null && structure.roomToResistancePercent < minimumRoomPercent) ||
    (stopDistancePercent !== null && (stopDistancePercent < 1.8 || stopDistancePercent > 5.4)) ||
    (target1DistancePercent !== null &&
      stopDistancePercent !== null &&
      target1DistancePercent / Math.max(stopDistancePercent, 0.0001) < 1.8) ||
    ((daily.change30d ?? 0) > 95 && (daily.rsi14 ?? 0) > 67);

  const staticSetupPassed = !hardReject && score >= 74;
  const buyAllowed = staticSetupPassed && confirmation.status === "CONFIRMED" && score >= 76;

  const reason = buyAllowed
    ? [
        "buy разрешен только после прохождения статических фильтров и отдельного confirm-layer по закрытой 1H свече",
        `подтверждение: ${confirmation.confirmationText}`,
        `room до ближайшего сопротивления: ${formatNumber(structure.roomToResistancePercent)}%`,
        `минимально допустимо: ${formatNumber(minimumRoomPercent)}%`,
        `ATR 1H: ${formatNumber(atr1hPercent)}%`,
        `стоп от цены: ${formatNumber(stopDistancePercent)}%`,
        `1H объем к среднему: ${formatNumber(intraday1h.volumeRatio)}`,
      ].join(", ")
    : hardBearish
      ? "дневной режим рынка слабый, импульс отрицательный и long-сценарий ломается"
      : [
          "сигнал удержан в HOLD, потому что long-сценарий еще не получил confirm-layer по закрытой 1H свече",
          `статический сетап: ${staticSetupPassed ? "пройден" : "не пройден"}`,
          `статус подтверждения: ${confirmation.status}`,
          `подтверждение: ${confirmation.confirmationText}`,
          `room до сопротивления: ${formatNumber(structure.roomToResistancePercent)}%`,
          `минимально допустимо: ${formatNumber(minimumRoomPercent)}%`,
          `стоп от цены: ${formatNumber(stopDistancePercent)}%`,
        ].join(", ");

  const signal: DeterministicSignal = hardBearish ? "SELL" : buyAllowed ? "BUY" : "HOLD";

  return {
    pair: market.pair.display,
    symbol: market.asset.symbol,
    quoteSymbol: market.pair.quoteSymbol,
    name: market.asset.name,
    price,
    priceUsd: market.spot.priceUsd,
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
    riskScore: round(riskScore),
    confirmationScore: round(confirmationScore),
    atr1h,
    atr1hPercent,
    nearestResistance: structure.nearestResistance,
    nextResistance: structure.nextResistance,
    nearestSupport: structure.nearestSupport,
    secondarySupport: structure.secondarySupport,
    roomToResistancePercent: structure.roomToResistancePercent,
    entryZoneLow,
    entryZoneHigh,
    breakEvenActivationPrice: rawTarget1,
    trailingAtrMultiplier: 1.35,
    protectiveStop,
    invalidationLevel,
    pullbackBuyZoneDistancePercent,
    stopDistancePercent,
    target1DistancePercent,
    minimumRoomPercent,
    entryConfirmationStatus: confirmation.status,
    entryConfirmationStrategy: confirmation.strategy,
    entryConfirmationText: confirmation.confirmationText,
    confirmationLevel: confirmation.confirmationLevel,
    confirmationRetestLevel: confirmation.retestLevel,
    confirmationBreakoutLevel: confirmation.breakoutLevel,
    lastClosed1hCandleTime: confirmation.lastClosedCandleTime,
    lastClosed1hCandleClose: confirmation.lastClosedCandleClose,
  };
}