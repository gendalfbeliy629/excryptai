import { getSpotPrice } from "./coincap.service";
import { getDailyOHLC, getPairPrice } from "./cryptocompare.service";
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
  };
  spot: {
    priceUsd: number;
    change24h: number | null;
    marketCapUsd: number | null;
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

  if (change === null) {
    return "SIDEWAYS";
  }

  if (sma7 > sma30 && change > 3) {
    return "BULLISH";
  }

  if (sma7 < sma30 && change < -3) {
    return "BEARISH";
  }

  return "SIDEWAYS";
}

export async function getCoinInfo(symbolInput: string): Promise<CoinInfo> {
  const spot = await getSpotPrice(symbolInput);

  return {
    symbol: spot.symbol,
    name: spot.name,
    priceUsd: spot.priceUsd,
    change24h: spot.changePercent24Hr,
    marketCapUsd: spot.marketCapUsd,
    volume24hUsd: null,
    source: "CoinCap",
  };
}

export async function getOHLC(
  symbolInput: string,
  limit = 30,
  quoteSymbolInput = "USDT"
): Promise<OHLCItem[]> {
  const candles = await getDailyOHLC(
    symbolInput,
    Math.max(limit, 30),
    quoteSymbolInput
  );

  return candles.map((row) => ({
    time: row.time,
    open: row.open,
    high: row.high,
    low: row.low,
    close: row.close,
    volumeFrom: row.volumeFrom,
    volumeTo: row.volumeTo,
  }));
}

export async function buildMarketContext(
  symbolInput: string,
  quoteSymbolInput = "USDT"
): Promise<MarketContext> {
  const baseSymbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  const [assetSpot, pairSpot, candles, liquidity, sentiment] = await Promise.all([
    getSpotPrice(baseSymbol),
    getPairPrice(baseSymbol, quoteSymbol),
    getOHLC(baseSymbol, 30, quoteSymbol),
    getLiquiditySnapshot(baseSymbol),
    getSentimentSnapshot(baseSymbol),
  ]);

  const highs = candles.map((c) => c.high).filter((v) => Number.isFinite(v));
  const lows = candles.map((c) => c.low).filter((v) => Number.isFinite(v));
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v));

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];

  const sma7 = calculateSMA(closes, 7);
  const sma30 = calculateSMA(closes, 30);
  const change30d = calculatePercentChange(firstClose, lastClose);
  const trend30d = detectTrend(closes, sma7, sma30);

  return {
    asset: {
      symbol: assetSpot.symbol,
      name: assetSpot.name,
      id: assetSpot.id,
    },
    pair: {
      baseSymbol,
      quoteSymbol,
      display: `${baseSymbol}/${quoteSymbol}`,
    },
    spot: {
      priceUsd: pairSpot.price,
      change24h: pairSpot.change24h,
      marketCapUsd: assetSpot.marketCapUsd,
    },
    technicals: {
      period: "30d",
      high30d: highs.length ? Math.max(...highs) : null,
      low30d: lows.length ? Math.min(...lows) : null,
      change30d,
      rsi14: calculateRSI(closes, 14),
      sma7,
      sma30,
      trend30d,
      candles,
    },
    liquidity,
    sentiment,
  };
}

export async function getMarketData(symbol: string) {
  return getCoinInfo(symbol);
}

export async function getCandles(
  symbol: string,
  limit = 30,
  quoteSymbolInput = "USDT"
) {
  return getOHLC(symbol, limit, quoteSymbolInput);
}