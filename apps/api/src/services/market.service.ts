import { getSpotPrice } from "./coincap.service";
import { getCryptoCompareCandles } from "./cryptocompare.service";
import {
  getOrderBookNotional,
  getPionexDepth,
  getPionexKlines,
  PionexBookTicker,
  PionexDepth,
  PionexTicker,
} from "./pionex.service";
import { getLiquiditySnapshot } from "./defillama.service";
import { getSentimentSnapshot } from "./santiment.service";
import { normalizeSymbol, SYMBOL_TO_COINCAP_ID } from "../utils/symbols";

export type TrendType = "BULLISH" | "BEARISH" | "SIDEWAYS";

export type OHLCItem = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  volumeFrom?: number;
  volumeTo?: number;
};

export type CoinInfo = {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  source: string;
};

export type ParsedPair = {
  baseSymbol: string;
  quoteSymbol: string;
  displayPair: string;
};

export type MarketContext = {
  asset: {
    symbol: string;
    name: string;
    id: string | null;
  };
  pair: {
    baseSymbol: string;
    quoteSymbol: string;
    display: string;
    exchange: "PIONEX";
    historySource: "CRYPTOCOMPARE";
  };
  spot: {
    price: number;
    priceUsd: number | null;
    change24h: number | null;
    marketCapUsd: number | null;
  };
  technicals: {
    period: "30d";
    high30d: number | null;
    low30d: number | null;
    change30d: number | null;
    rsi14: number | null;
    adx14: number | null;
    sma7: number | null;
    sma30: number | null;
    ema20: number | null;
    ema50: number | null;
    macdLine: number | null;
    macdSignal: number | null;
    macdHistogram: number | null;
    trend30d: TrendType;
    candles: OHLCItem[];
    intraday1m: {
      candles: OHLCItem[];
    };
    intraday5m: {
      candles: OHLCItem[];
    };
    intraday15m: {
      candles: OHLCItem[];
    };
    intraday30m: {
      candles: OHLCItem[];
    };
    intraday1h: {
      candles: OHLCItem[];
      rsi14: number | null;
      ema20: number | null;
      ema50: number | null;
      atr14: number | null;
      adx14: number | null;
      macdLine: number | null;
      macdSignal: number | null;
      macdHistogram: number | null;
      bbBasis20: number | null;
      bbUpper20: number | null;
      bbLower20: number | null;
      avgVolume20: number | null;
      volumeRatio: number | null;
      latestVolume: number | null;
      recentSwingHigh: number | null;
      recentSwingLow: number | null;
    };
    intraday4h: {
      candles: OHLCItem[];
      rsi14: number | null;
      ema20: number | null;
      ema50: number | null;
      atr14: number | null;
      adx14: number | null;
      macdLine: number | null;
      macdSignal: number | null;
      macdHistogram: number | null;
      avgVolume20: number | null;
      volumeRatio: number | null;
    };
    structure: {
      nearestResistance: number | null;
      nextResistance: number | null;
      nearestSupport: number | null;
      secondarySupport: number | null;
      roomToResistancePercent: number | null;
      pullbackFromResistancePercent: number | null;
    };
  };
  execution: {
    bestBid: number | null;
    bestAsk: number | null;
    spreadPercent: number | null;
    orderBookBidNotional: number | null;
    orderBookAskNotional: number | null;
    orderBookImbalance: number | null;
    sellWallPressure: number | null;
    buyWallPressure: number | null;
  };
  liquidity: {
    totalTvlUsd: number | null;
    protocolsUsed: string[];
  };
  sentiment: {
    socialVolumeTotal: number | null;
    socialDominanceLatest: number | null;
  };
};

export type BuildMarketContextOptions = {
  ticker?: PionexTicker;
  bookTicker?: PionexBookTicker | null;
  depth?: PionexDepth | null;
  includeExtendedIntradayCandles?: boolean;
};

const STABLE_QUOTES = new Set([
  "USD",
  "USDT",
  "USDC",
  "BUSD",
  "FDUSD",
  "TUSD",
  "DAI",
]);

function normalizeQuoteSymbol(input: string): string {
  return input.trim().toUpperCase().replace(/\//g, "");
}

export function parseMarketPair(rawInput?: string): ParsedPair {
  const input = (rawInput || "BTC/USDT").trim().toUpperCase();

  if (!input) {
    return {
      baseSymbol: "BTC",
      quoteSymbol: "USDT",
      displayPair: "BTC/USDT",
    };
  }

  if (input.includes("/")) {
    const [baseRaw, quoteRaw] = input.split("/");
    const baseSymbol = normalizeSymbol(baseRaw || "");
    const quoteSymbol = normalizeQuoteSymbol(quoteRaw || "");

    if (!baseSymbol || !quoteSymbol) {
      throw new Error("INVALID_PAIR_FORMAT");
    }

    return {
      baseSymbol,
      quoteSymbol,
      displayPair: `${baseSymbol}/${quoteSymbol}`,
    };
  }

  const baseSymbol = normalizeSymbol(input);

  if (!baseSymbol) {
    throw new Error("INVALID_PAIR_FORMAT");
  }

  return {
    baseSymbol,
    quoteSymbol: "USDT",
    displayPair: `${baseSymbol}/USDT`,
  };
}

function toOHLC(
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    amount: number;
  }>
): OHLCItem[] {
  return candles.map((row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volume: row.volume,
    quoteVolume: row.amount,
    volumeFrom: row.volume,
    volumeTo: row.amount,
  }));
}

function calculateRSI(closes: number[], period = 14): number | null {
  if (closes.length <= period) return null;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  return slice.reduce((acc, value) => acc + value, 0) / period;
}

function calculateEMA(values: number[], period: number): number | null {
  if (values.length < period) return null;

  const multiplier = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((acc, value) => acc + value, 0) / period;

  for (let i = period; i < values.length; i++) {
    ema = values[i] * multiplier + ema * (1 - multiplier);
  }

  return ema;
}

function calculateATR(candles: OHLCItem[], period = 14): number | null {
  if (candles.length <= period) return null;

  const ranges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    ranges.push(tr);
  }

  if (ranges.length < period) return null;

  let atr = ranges.slice(0, period).reduce((acc, value) => acc + value, 0) / period;

  for (let i = period; i < ranges.length; i++) {
    atr = (atr * (period - 1) + ranges[i]) / period;
  }

  return atr;
}

function calculatePercentChange(start: number, end: number): number | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
    return null;
  }

  return ((end - start) / start) * 100;
}

function detectTrend(
  closes: number[],
  sma7: number | null,
  sma30: number | null
): TrendType {
  if (closes.length < 7 || sma7 === null || sma30 === null) {
    return "SIDEWAYS";
  }

  const lastClose = closes[closes.length - 1];
  const firstClose = closes[0];
  const change = calculatePercentChange(firstClose, lastClose);

  if (change === null) return "SIDEWAYS";
  if (sma7 > sma30 && change > 3) return "BULLISH";
  if (sma7 < sma30 && change < -3) return "BEARISH";
  return "SIDEWAYS";
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function latestVolumeRatio(candles: OHLCItem[]) {
  const volumes = candles
    .map((item) => item.volumeTo ?? item.volumeFrom ?? 0)
    .filter((value) => value > 0);

  if (!volumes.length) {
    return { latestVolume: null, avgVolume20: null, ratio: null };
  }

  const latestVolume = volumes[volumes.length - 1] ?? null;
  const history = volumes.slice(Math.max(0, volumes.length - 21), volumes.length - 1);
  const avgVolume20 = average(history);
  const ratio =
    latestVolume !== null && avgVolume20 !== null && avgVolume20 > 0
      ? latestVolume / avgVolume20
      : null;

  return {
    latestVolume,
    avgVolume20,
    ratio,
  };
}

function collectSwingHighs(candles: OHLCItem[], left = 2, right = 2): number[] {
  const levels: number[] = [];

  for (let i = left; i < candles.length - right; i++) {
    const current = candles[i];
    let isSwingHigh = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= current.high) {
        isSwingHigh = false;
        break;
      }
    }

    if (isSwingHigh) {
      levels.push(current.high);
    }
  }

  return levels;
}

function collectSwingLows(candles: OHLCItem[], left = 2, right = 2): number[] {
  const levels: number[] = [];

  for (let i = left; i < candles.length - right; i++) {
    const current = candles[i];
    let isSwingLow = true;

    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].low <= current.low) {
        isSwingLow = false;
        break;
      }
    }

    if (isSwingLow) {
      levels.push(current.low);
    }
  }

  return levels;
}

function dedupeNearbyLevels(levels: number[], tolerance = 0.004): number[] {
  const deduped: number[] = [];

  for (const level of levels) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(level - last) / last > tolerance) {
      deduped.push(level);
    }
  }

  return deduped;
}

function selectResistanceLevels(price: number, candles1h: OHLCItem[], candles4h: OHLCItem[], candles1d: OHLCItem[]) {
  const merged = [
    ...collectSwingHighs(candles1h),
    ...collectSwingHighs(candles4h),
    ...collectSwingHighs(candles1d, 1, 1),
  ]
    .filter((level) => level > price)
    .sort((a, b) => a - b);

  const deduped = dedupeNearbyLevels(merged, 0.0045);

  return {
    nearestResistance: deduped[0] ?? null,
    nextResistance: deduped[1] ?? deduped[0] ?? null,
  };
}

function selectSupportLevels(price: number, candles1h: OHLCItem[], candles4h: OHLCItem[], candles1d: OHLCItem[]) {
  const merged = [
    ...collectSwingLows(candles1h),
    ...collectSwingLows(candles4h),
    ...collectSwingLows(candles1d, 1, 1),
  ]
    .filter((level) => level < price)
    .sort((a, b) => b - a);

  const deduped = dedupeNearbyLevels(merged, 0.0045);

  return {
    nearestSupport: deduped[0] ?? null,
    secondarySupport: deduped[1] ?? deduped[0] ?? null,
  };
}

function calculateMACD(values: number[]) {
  const ema12 = calculateEMA(values, 12);
  const ema26 = calculateEMA(values, 26);

  if (ema12 === null || ema26 === null) {
    return { line: null, signal: null, histogram: null };
  }

  const macdSeries: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const slice = values.slice(0, i + 1);
    const fast = calculateEMA(slice, 12);
    const slow = calculateEMA(slice, 26);
    if (fast !== null && slow !== null) {
      macdSeries.push(fast - slow);
    }
  }

  const signal = calculateEMA(macdSeries, 9);
  const line = ema12 - ema26;
  const histogram = signal !== null ? line - signal : null;

  return { line, signal, histogram };
}

function calculateADX(candles: OHLCItem[], period = 14): number | null {
  if (candles.length <= period * 2) return null;

  const trs: number[] = [];
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    const upMove = current.high - previous.high;
    const downMove = previous.low - current.low;

    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    trs.push(tr);
    plusDMs.push(plusDM);
    minusDMs.push(minusDM);
  }

  if (trs.length < period) return null;

  let atr = trs.slice(0, period).reduce((acc, value) => acc + value, 0);
  let plusDM = plusDMs.slice(0, period).reduce((acc, value) => acc + value, 0);
  let minusDM = minusDMs.slice(0, period).reduce((acc, value) => acc + value, 0);

  const dxValues: number[] = [];

  for (let i = period; i < trs.length; i++) {
    atr = atr - atr / period + trs[i];
    plusDM = plusDM - plusDM / period + plusDMs[i];
    minusDM = minusDM - minusDM / period + minusDMs[i];

    if (atr <= 0) continue;

    const plusDI = (plusDM / atr) * 100;
    const minusDI = (minusDM / atr) * 100;
    const denominator = plusDI + minusDI;

    if (denominator <= 0) continue;

    const dx = (Math.abs(plusDI - minusDI) / denominator) * 100;
    dxValues.push(dx);
  }

  if (dxValues.length < period) return null;

  let adx = dxValues.slice(0, period).reduce((acc, value) => acc + value, 0) / period;

  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  return adx;
}

function calculateBollinger(values: number[], period = 20, multiplier = 2) {
  if (values.length < period) {
    return { basis: null, upper: null, lower: null };
  }

  const slice = values.slice(values.length - period);
  const basis = slice.reduce((acc, value) => acc + value, 0) / period;
  const variance =
    slice.reduce((acc, value) => acc + Math.pow(value - basis, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    basis,
    upper: basis + stdDev * multiplier,
    lower: basis - stdDev * multiplier,
  };
}

async function getQuoteUsdPrice(quoteSymbol: string): Promise<number | null> {
  const normalized = normalizeQuoteSymbol(quoteSymbol);

  if (STABLE_QUOTES.has(normalized)) {
    return 1;
  }

  if (!SYMBOL_TO_COINCAP_ID[normalized]) {
    return null;
  }

  try {
    const quote = await getSpotPrice(normalized);
    return quote.priceUsd;
  } catch {
    return null;
  }
}

function fallbackLiquidity() {
  return { totalTvlUsd: null, protocolsUsed: [] as string[] };
}

function fallbackSentiment() {
  return { socialVolumeTotal: null, socialDominanceLatest: null };
}

export async function getCoinInfo(symbolInput: string): Promise<CoinInfo> {
  const pair = parseMarketPair(symbolInput);
  const [quoteUsdPrice, assetSpot] = await Promise.all([
    getQuoteUsdPrice(pair.quoteSymbol),
    SYMBOL_TO_COINCAP_ID[pair.baseSymbol]
      ? getSpotPrice(pair.baseSymbol).catch(() => null)
      : Promise.resolve(null),
  ]);

  const ticker = await getPionexKlines(pair.baseSymbol, pair.quoteSymbol, "60M", 2)
    .then((candles) => candles[candles.length - 1])
    .catch(() => null);

  const price = ticker?.close ?? null;
  const priceUsd = price !== null && quoteUsdPrice !== null ? price * quoteUsdPrice : null;

  return {
    symbol: pair.baseSymbol,
    name: assetSpot?.name ?? pair.baseSymbol,
    priceUsd,
    change24h: null,
    marketCapUsd: assetSpot?.marketCapUsd ?? null,
    volume24hUsd: null,
    source: "Pionex",
  };
}

export async function getOHLC(
  symbolInput: string,
  limit = 30,
  quoteSymbolInput = "USDT"
): Promise<OHLCItem[]> {
  const baseSymbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);
  const candles = await getCryptoCompareCandles(baseSymbol, quoteSymbol, "1D", Math.max(limit, 35));

  return candles
    .map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }))
    .slice(-limit);
}

export async function getCandles(
  symbolInput: string,
  limit = 30,
  quoteSymbolInput = "USDT"
): Promise<OHLCItem[]> {
  return getOHLC(symbolInput, limit, quoteSymbolInput);
}

export async function getMarketData(symbolInput: string): Promise<CoinInfo> {
  return getCoinInfo(symbolInput);
}

export async function buildMarketContext(
  baseSymbolInput: string,
  quoteSymbolInput = "USDT",
  options: BuildMarketContextOptions = {}
): Promise<MarketContext> {
  const baseSymbol = normalizeSymbol(baseSymbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  const depthPromise = options.depth
    ? Promise.resolve(options.depth)
    : getPionexDepth(baseSymbol, quoteSymbol, 20).catch(() => null);

  const assetSpotPromise = SYMBOL_TO_COINCAP_ID[baseSymbol]
    ? getSpotPrice(baseSymbol).catch(() => null)
    : Promise.resolve(null);

  const quoteUsdPromise = getQuoteUsdPrice(quoteSymbol);
  const liquidityPromise = getLiquiditySnapshot(baseSymbol).catch(() => fallbackLiquidity());
  const sentimentPromise = getSentimentSnapshot(baseSymbol).catch(() => fallbackSentiment());

  const includeExtendedIntradayCandles = options.includeExtendedIntradayCandles ?? true;

  const [dailyRaw, candles1hRaw, candles4hRaw, candles1mRaw, candles5mRaw, candles15mRaw, candles30mRaw, depth, assetSpot, quoteUsdPrice, liquidity, sentiment] =
    await Promise.all([
      getCryptoCompareCandles(baseSymbol, quoteSymbol, "1D", 365),
      getCryptoCompareCandles(baseSymbol, quoteSymbol, "1H", 24 * 30),
      getCryptoCompareCandles(baseSymbol, quoteSymbol, "4H", 6 * 365),
      includeExtendedIntradayCandles
        ? getCryptoCompareCandles(baseSymbol, quoteSymbol, "1m", 1440)
        : Promise.resolve([]),
      includeExtendedIntradayCandles
        ? getCryptoCompareCandles(baseSymbol, quoteSymbol, "5m", 2000)
        : Promise.resolve([]),
      includeExtendedIntradayCandles
        ? getCryptoCompareCandles(baseSymbol, quoteSymbol, "15m", 2000)
        : Promise.resolve([]),
      includeExtendedIntradayCandles
        ? getCryptoCompareCandles(baseSymbol, quoteSymbol, "30m", 2000)
        : Promise.resolve([]),
      depthPromise,
      assetSpotPromise,
      quoteUsdPromise,
      liquidityPromise,
      sentimentPromise,
    ]);

  const ticker =
    options.ticker ??
    (() => {
      const last = candles1hRaw[candles1hRaw.length - 1];
      if (!last) {
        throw new Error(`Ticker is required for ${baseSymbol}/${quoteSymbol}`);
      }

      return {
        symbol: `${baseSymbol}_${quoteSymbol}`,
        baseSymbol,
        quoteSymbol,
        open: last.open,
        close: last.close,
        high: last.high,
        low: last.low,
        volume: last.volumeFrom,
        amount: last.volumeTo,
        count: null,
        changePercent24h:
          candles1hRaw.length >= 24
            ? calculatePercentChange(candles1hRaw[candles1hRaw.length - 24]?.close ?? last.open, last.close)
            : null,
        time: last.time,
      } as PionexTicker;
    })();

  const candles = dailyRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));
  const candles1h = candles1hRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));
  const candles4h = candles4hRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));
  const candles1m = candles1mRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));
  const candles5m = candles5mRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));
  const candles15m = candles15mRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));
  const candles30m = candles30mRaw.map((item) => ({ ...item, volume: item.volumeFrom, quoteVolume: item.volumeTo }));

  if (candles.length < 30) {
    throw new Error(`Not enough daily candles for ${baseSymbol}/${quoteSymbol}`);
  }

  if (candles1h.length < 50) {
    throw new Error(`Not enough 1H candles for ${baseSymbol}/${quoteSymbol}`);
  }

  if (candles4h.length < 50) {
    throw new Error(`Not enough 4H candles for ${baseSymbol}/${quoteSymbol}`);
  }

  const price = ticker.close;
  const priceUsd = quoteUsdPrice !== null ? price * quoteUsdPrice : null;

  const candles30d = candles.slice(-30);
  const dailyCloses = candles30d.map((item) => item.close);
  const closes1h = candles1h.map((item) => item.close);
  const closes4h = candles4h.map((item) => item.close);

  const sma7 = calculateSMA(dailyCloses, 7);
  const sma30 = calculateSMA(dailyCloses, 30);
  const ema20_1d = calculateEMA(dailyCloses, 20);
  const ema50_1d = calculateEMA(dailyCloses, 50);
  const dailyMacd = calculateMACD(dailyCloses);
  const rsi14 = calculateRSI(dailyCloses, 14);
  const adx14 = calculateADX(candles30d, 14);
  const change30d = calculatePercentChange(dailyCloses[0], dailyCloses[dailyCloses.length - 1]);
  const trend30d = detectTrend(dailyCloses, sma7, sma30);

  const ema20_1h = calculateEMA(closes1h, 20);
  const ema50_1h = calculateEMA(closes1h, 50);
  const atr14_1h = calculateATR(candles1h, 14);
  const rsi14_1h = calculateRSI(closes1h, 14);
  const adx14_1h = calculateADX(candles1h, 14);
  const macd1h = calculateMACD(closes1h);
  const bb1h = calculateBollinger(closes1h, 20, 2);
  const volume1h = latestVolumeRatio(candles1h);

  const ema20_4h = calculateEMA(closes4h, 20);
  const ema50_4h = calculateEMA(closes4h, 50);
  const atr14_4h = calculateATR(candles4h, 14);
  const rsi14_4h = calculateRSI(closes4h, 14);
  const adx14_4h = calculateADX(candles4h, 14);
  const macd4h = calculateMACD(closes4h);
  const volume4h = latestVolumeRatio(candles4h);

  const highs = candles30d.map((c) => c.high);
  const lows = candles30d.map((c) => c.low);

  const recentSwingHigh = Math.max(...candles1h.slice(-24).map((c) => c.high));
  const recentSwingLow = Math.min(...candles1h.slice(-24).map((c) => c.low));

  const resistanceLevels = selectResistanceLevels(price, candles1h.slice(0, -2), candles4h.slice(0, -1), candles.slice(0, -1));
  const supportLevels = selectSupportLevels(price, candles1h.slice(0, -1), candles4h.slice(0, -1), candles.slice(0, -1));

  const roomToResistancePercent = resistanceLevels.nearestResistance
    ? calculatePercentChange(price, resistanceLevels.nearestResistance)
    : null;

  const pullbackFromResistancePercent = resistanceLevels.nearestResistance
    ? calculatePercentChange(resistanceLevels.nearestResistance, price)
    : null;

  const bestBid = options.bookTicker?.bidPrice ?? price;
  const bestAsk = options.bookTicker?.askPrice ?? price;
  const spreadPercent = bestAsk > 0 ? ((bestAsk - bestBid) / bestAsk) * 100 : null;

  const notionals = depth
    ? getOrderBookNotional(depth, 10)
    : { bidNotional: null, askNotional: null };

  const totalNotional = (notionals.bidNotional ?? 0) + (notionals.askNotional ?? 0);

  const orderBookImbalance =
    totalNotional > 0
      ? ((notionals.bidNotional ?? 0) - (notionals.askNotional ?? 0)) / totalNotional
      : null;

  const sellWallPressure =
    notionals.askNotional !== null && notionals.bidNotional !== null
      ? notionals.askNotional / Math.max(notionals.bidNotional, 1)
      : null;

  const buyWallPressure =
    notionals.askNotional !== null && notionals.bidNotional !== null
      ? notionals.bidNotional / Math.max(notionals.askNotional, 1)
      : null;

  return {
    asset: {
      symbol: baseSymbol,
      name: assetSpot?.name ?? baseSymbol,
      id: assetSpot?.id ?? null,
    },
    pair: {
      baseSymbol,
      quoteSymbol,
      display: `${baseSymbol}/${quoteSymbol}`,
      exchange: "PIONEX",
      historySource: "CRYPTOCOMPARE",
    },
    spot: {
      price,
      priceUsd,
      change24h: ticker.changePercent24h,
      marketCapUsd: assetSpot?.marketCapUsd ?? null,
    },
    technicals: {
      period: "30d",
      high30d: highs.length ? Math.max(...highs) : null,
      low30d: lows.length ? Math.min(...lows) : null,
      change30d,
      rsi14,
      adx14,
      sma7,
      sma30,
      ema20: ema20_1d,
      ema50: ema50_1d,
      macdLine: dailyMacd.line,
      macdSignal: dailyMacd.signal,
      macdHistogram: dailyMacd.histogram,
      trend30d,
      candles,
      intraday1m: {
        candles: candles1m,
      },
      intraday5m: {
        candles: candles5m,
      },
      intraday15m: {
        candles: candles15m,
      },
      intraday30m: {
        candles: candles30m,
      },
      intraday1h: {
        candles: candles1h,
        rsi14: rsi14_1h,
        ema20: ema20_1h,
        ema50: ema50_1h,
        atr14: atr14_1h,
        adx14: adx14_1h,
        macdLine: macd1h.line,
        macdSignal: macd1h.signal,
        macdHistogram: macd1h.histogram,
        bbBasis20: bb1h.basis,
        bbUpper20: bb1h.upper,
        bbLower20: bb1h.lower,
        avgVolume20: volume1h.avgVolume20,
        volumeRatio: volume1h.ratio,
        latestVolume: volume1h.latestVolume,
        recentSwingHigh,
        recentSwingLow,
      },
      intraday4h: {
        candles: candles4h,
        rsi14: rsi14_4h,
        ema20: ema20_4h,
        ema50: ema50_4h,
        atr14: atr14_4h,
        adx14: adx14_4h,
        macdLine: macd4h.line,
        macdSignal: macd4h.signal,
        macdHistogram: macd4h.histogram,
        avgVolume20: volume4h.avgVolume20,
        volumeRatio: volume4h.ratio,
      },
      structure: {
        nearestResistance: resistanceLevels.nearestResistance,
        nextResistance: resistanceLevels.nextResistance,
        nearestSupport: supportLevels.nearestSupport,
        secondarySupport: supportLevels.secondarySupport,
        roomToResistancePercent,
        pullbackFromResistancePercent,
      },
    },
    execution: {
      bestBid,
      bestAsk,
      spreadPercent,
      orderBookBidNotional: notionals.bidNotional,
      orderBookAskNotional: notionals.askNotional,
      orderBookImbalance,
      sellWallPressure,
      buyWallPressure,
    },
    liquidity,
    sentiment,
  };
}