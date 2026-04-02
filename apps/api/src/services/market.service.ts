import { getSpotPrice } from "./coincap.service";
import {
  getOrderBookNotional,
  getPionexBookTicker,
  getPionexDepth,
  getPionexKlines,
  getPionexTicker,
  PionexCandle,
} from "./pionex.service";
import { getLiquiditySnapshot } from "./defillama.service";
import { getSentimentSnapshot } from "./santiment.service";
import { normalizeSymbol } from "../utils/symbols";

export type CoinInfo = {
  symbol: string;
  name: string;
  priceUsd: number | null;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  source: string;
};

export type OHLCItem = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeFrom?: number;
  volumeTo?: number;
};

export type TrendType = "BULLISH" | "BEARISH" | "SIDEWAYS";

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
  };
  spot: {
    priceUsd: number;
    change24h: number | null;
    marketCapUsd: number | null;
    source: string;
  };
  technicals: {
    period: "30d";
    high30d: number | null;
    low30d: number | null;
    change30d: number | null;
    rsi14: number | null;
    sma7: number | null;
    sma30: number | null;
    trend30d: TrendType;
    candles: OHLCItem[];
    intraday1h: {
      candles: OHLCItem[];
      rsi14: number | null;
      ema20: number | null;
      ema50: number | null;
      atr14: number | null;
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
      avgVolume20: number | null;
      volumeRatio: number | null;
    };
    structure: {
      nearestResistanceUsd: number | null;
      nextResistanceUsd: number | null;
      nearestSupportUsd: number | null;
      roomToResistancePercent: number | null;
      pullbackFromResistancePercent: number | null;
    };
  };
  execution: {
    bestBidUsd: number | null;
    bestAskUsd: number | null;
    spreadPercent: number | null;
    orderBookBidNotionalUsd: number | null;
    orderBookAskNotionalUsd: number | null;
    orderBookImbalance: number | null;
    sellWallPressure: number | null;
    buyWallPressure: number | null;
    source: string;
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

function normalizeQuoteSymbol(input: string): string {
  return input.trim().toUpperCase().replace(/\//g, "");
}

export function parseMarketPair(rawInput?: string): ParsedPair {
  const input = (rawInput || "BTC/USDT").trim().toUpperCase();

  if (!input) {
    return {
      baseSymbol: "BTC",
      quoteSymbol: "USDT",
      displayPair: "BTC/USDT"
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
      displayPair: `${baseSymbol}/${quoteSymbol}`
    };
  }

  const baseSymbol = normalizeSymbol(input);

  if (!baseSymbol) {
    throw new Error("INVALID_PAIR_FORMAT");
  }

  return {
    baseSymbol,
    quoteSymbol: "USDT",
    displayPair: `${baseSymbol}/USDT`
  };
}

function toOHLC(candles: PionexCandle[]): OHLCItem[] {
  return candles.map((row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volumeFrom: row.volume,
    volumeTo: row.amount
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
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / period;
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

function detectTrend(closes: number[], sma7: number | null, sma30: number | null): TrendType {
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

function latestVolumeRatio(candles: OHLCItem[]): { latestVolume: number | null; avgVolume20: number | null; ratio: number | null } {
  const volumes = candles.map((item) => item.volumeTo ?? item.volumeFrom ?? 0).filter((value) => value > 0);
  if (!volumes.length) return { latestVolume: null, avgVolume20: null, ratio: null };
  const latestVolume = volumes[volumes.length - 1] ?? null;
  const avgVolume20 = average(volumes.slice(-21, -1));
  const ratio = latestVolume !== null && avgVolume20 && avgVolume20 > 0 ? latestVolume / avgVolume20 : null;
  return { latestVolume, avgVolume20, ratio };
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
    if (isSwingHigh) levels.push(current.high);
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
    if (isSwingLow) levels.push(current.low);
  }
  return levels;
}

function selectResistanceLevels(price: number, candles1h: OHLCItem[], candles4h: OHLCItem[]) {
  const merged = [...collectSwingHighs(candles1h), ...collectSwingHighs(candles4h)]
    .filter((level) => level > price)
    .sort((a, b) => a - b);

  const deduped: number[] = [];
  for (const level of merged) {
    const last = deduped[deduped.length - 1];
    if (!last || Math.abs(level - last) / last > 0.0035) {
      deduped.push(level);
    }
  }

  return {
    nearestResistanceUsd: deduped[0] ?? null,
    nextResistanceUsd: deduped[1] ?? deduped[0] ?? null
  };
}

function selectSupport(price: number, candles1h: OHLCItem[], candles4h: OHLCItem[]) {
  const merged = [...collectSwingLows(candles1h), ...collectSwingLows(candles4h)]
    .filter((level) => level < price)
    .sort((a, b) => b - a);

  return merged[0] ?? null;
}

function fallbackLiquidity(): MarketContext["liquidity"] {
  return { totalTvlUsd: null, protocolsUsed: [] };
}

function fallbackSentiment(): MarketContext["sentiment"] {
  return { socialVolumeTotal: null, socialDominanceLatest: null };
}

export async function getCoinInfo(symbolInput: string): Promise<CoinInfo> {
  const baseSymbol = normalizeSymbol(symbolInput);
  const [spot, ticker] = await Promise.all([
    getSpotPrice(baseSymbol),
    getPionexTicker(baseSymbol, "USDT").catch(() => null)
  ]);

  return {
    symbol: spot.symbol,
    name: spot.name,
    priceUsd: ticker?.close ?? spot.priceUsd,
    change24h: ticker?.changePercent24h ?? spot.changePercent24Hr,
    marketCapUsd: spot.marketCapUsd,
    volume24hUsd: ticker?.amount ?? null,
    source: ticker ? "Pionex + CoinCap" : "CoinCap"
  };
}

export async function getOHLC(symbolInput: string, limit = 30, quoteSymbolInput = "USDT"): Promise<OHLCItem[]> {
  const baseSymbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);
  const candles = await getPionexKlines(baseSymbol, quoteSymbol, "1D", Math.max(limit, 30));
  return toOHLC(candles);
}

export async function buildMarketContext(symbolInput: string, quoteSymbolInput = "USDT"): Promise<MarketContext> {
  const baseSymbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  const assetSpotPromise = getSpotPrice(baseSymbol);
  const tickerPromise = getPionexTicker(baseSymbol, quoteSymbol);
  const bookTickerPromise = getPionexBookTicker(baseSymbol, quoteSymbol).catch(() => null);
  const depthPromise = getPionexDepth(baseSymbol, quoteSymbol, 20).catch(() => null);
  const dailyPromise = getPionexKlines(baseSymbol, quoteSymbol, "1D", 35).catch(() => []);
  const candles1hPromise = getPionexKlines(baseSymbol, quoteSymbol, "60M", 120).catch(() => []);
  const candles4hPromise = getPionexKlines(baseSymbol, quoteSymbol, "4H", 120).catch(() => []);
  const liquidityPromise = getLiquiditySnapshot(baseSymbol).catch(() => fallbackLiquidity());
  const sentimentPromise = getSentimentSnapshot(baseSymbol).catch(() => fallbackSentiment());

  const [assetSpot, ticker, bookTicker, depth, dailyRaw, candles1hRaw, candles4hRaw, liquidity, sentiment] =
    await Promise.all([
      assetSpotPromise,
      tickerPromise,
      bookTickerPromise,
      depthPromise,
      dailyPromise,
      candles1hPromise,
      candles4hPromise,
      liquidityPromise,
      sentimentPromise
    ]);

  const candles = toOHLC(dailyRaw);
  const candles1h = toOHLC(candles1hRaw);
  const candles4h = toOHLC(candles4hRaw);

  const dailyCloses = candles.map((c) => c.close);
  const closes1h = candles1h.map((c) => c.close);
  const closes4h = candles4h.map((c) => c.close);

  const firstClose = dailyCloses[0];
  const lastClose = dailyCloses[dailyCloses.length - 1];

  const sma7 = calculateSMA(dailyCloses, 7);
  const sma30 = calculateSMA(dailyCloses, 30);
  const change30d = firstClose && lastClose ? calculatePercentChange(firstClose, lastClose) : null;
  const trend30d = detectTrend(dailyCloses, sma7, sma30);

  const ema20_1h = calculateEMA(closes1h, 20);
  const ema50_1h = calculateEMA(closes1h, 50);
  const atr14_1h = calculateATR(candles1h, 14);
  const rsi14_1h = calculateRSI(closes1h, 14);
  const volume1h = latestVolumeRatio(candles1h);

  const ema20_4h = calculateEMA(closes4h, 20);
  const ema50_4h = calculateEMA(closes4h, 50);
  const atr14_4h = calculateATR(candles4h, 14);
  const rsi14_4h = calculateRSI(closes4h, 14);
  const volume4h = latestVolumeRatio(candles4h);

  const highs = candles.map((c) => c.high).filter(Number.isFinite);
  const lows = candles.map((c) => c.low).filter(Number.isFinite);
  const recentSwingHigh = candles1h.length ? Math.max(...candles1h.slice(-24).map((c) => c.high)) : null;
  const recentSwingLow = candles1h.length ? Math.min(...candles1h.slice(-24).map((c) => c.low)) : null;

  const resistanceLevels = selectResistanceLevels(ticker.close, candles1h.slice(0, -2), candles4h.slice(0, -1));
  const nearestSupportUsd = selectSupport(ticker.close, candles1h.slice(0, -1), candles4h.slice(0, -1));
  const roomToResistancePercent = resistanceLevels.nearestResistanceUsd
    ? calculatePercentChange(ticker.close, resistanceLevels.nearestResistanceUsd)
    : null;
  const pullbackFromResistancePercent = resistanceLevels.nearestResistanceUsd
    ? calculatePercentChange(resistanceLevels.nearestResistanceUsd, ticker.close)
    : null;

  const book = bookTicker ?? {
    bidPrice: ticker.close,
    bidSize: 0,
    askPrice: ticker.close,
    askSize: 0,
    symbol: `${baseSymbol}_${quoteSymbol}`
  };

  const spreadPercent = book.askPrice > 0 ? ((book.askPrice - book.bidPrice) / book.askPrice) * 100 : null;
  const notionals = depth ? getOrderBookNotional(depth, 10) : { bidNotionalUsd: null, askNotionalUsd: null };
  const totalNotional = (notionals.bidNotionalUsd ?? 0) + (notionals.askNotionalUsd ?? 0);
  const orderBookImbalance = totalNotional > 0
    ? ((notionals.bidNotionalUsd ?? 0) - (notionals.askNotionalUsd ?? 0)) / totalNotional
    : null;
  const sellWallPressure = notionals.askNotionalUsd && notionals.bidNotionalUsd
    ? notionals.askNotionalUsd / Math.max(notionals.bidNotionalUsd, 1)
    : null;
  const buyWallPressure = notionals.askNotionalUsd && notionals.bidNotionalUsd
    ? notionals.bidNotionalUsd / Math.max(notionals.askNotionalUsd, 1)
    : null;

  return {
    asset: {
      symbol: assetSpot.symbol,
      name: assetSpot.name,
      id: assetSpot.id
    },
    pair: {
      baseSymbol,
      quoteSymbol,
      display: `${baseSymbol}/${quoteSymbol}`,
      exchange: "PIONEX"
    },
    spot: {
      priceUsd: ticker.close,
      change24h: ticker.changePercent24h,
      marketCapUsd: assetSpot.marketCapUsd,
      source: "Pionex"
    },
    technicals: {
      period: "30d",
      high30d: highs.length ? Math.max(...highs) : null,
      low30d: lows.length ? Math.min(...lows) : null,
      change30d,
      rsi14: calculateRSI(dailyCloses, 14),
      sma7,
      sma30,
      trend30d,
      candles,
      intraday1h: {
        candles: candles1h,
        rsi14: rsi14_1h,
        ema20: ema20_1h,
        ema50: ema50_1h,
        atr14: atr14_1h,
        avgVolume20: volume1h.avgVolume20,
        volumeRatio: volume1h.ratio,
        latestVolume: volume1h.latestVolume,
        recentSwingHigh,
        recentSwingLow
      },
      intraday4h: {
        candles: candles4h,
        rsi14: rsi14_4h,
        ema20: ema20_4h,
        ema50: ema50_4h,
        atr14: atr14_4h,
        avgVolume20: volume4h.avgVolume20,
        volumeRatio: volume4h.ratio
      },
      structure: {
        nearestResistanceUsd: resistanceLevels.nearestResistanceUsd,
        nextResistanceUsd: resistanceLevels.nextResistanceUsd,
        nearestSupportUsd,
        roomToResistancePercent,
        pullbackFromResistancePercent
      }
    },
    execution: {
      bestBidUsd: book.bidPrice,
      bestAskUsd: book.askPrice,
      spreadPercent,
      orderBookBidNotionalUsd: notionals.bidNotionalUsd,
      orderBookAskNotionalUsd: notionals.askNotionalUsd,
      orderBookImbalance,
      sellWallPressure,
      buyWallPressure,
      source: "Pionex"
    },
    liquidity,
    sentiment
  };
}

export async function getMarketData(symbol: string) {
  return getCoinInfo(symbol);
}

export async function getCandles(symbol: string, limit = 30, quoteSymbolInput = "USDT") {
  return getOHLC(symbol, limit, quoteSymbolInput);
}