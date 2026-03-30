import { getSpotPrice } from "./coincap.service";
import { getHourlyOHLC } from "./cryptocompare.service";
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

export type MarketContext = {
  asset: {
    symbol: string;
    name: string;
    id: string | null;
  };
  spot: {
    priceUsd: number;
    change24h: number | null;
    marketCapUsd: number | null;
  };
  technicals: {
    high24h: number | null;
    low24h: number | null;
    rsi14: number | null;
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
  limit = 30
): Promise<OHLCItem[]> {
  const candles = await getHourlyOHLC(symbolInput, Math.max(limit, 15));

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
  symbolInput: string
): Promise<MarketContext> {
  const symbol = normalizeSymbol(symbolInput);

  const [spot, candles, liquidity, sentiment] = await Promise.all([
    getSpotPrice(symbol),
    getOHLC(symbol, 24),
    getLiquiditySnapshot(symbol),
    getSentimentSnapshot(symbol),
  ]);

  const highs = candles.map((c) => c.high).filter((v) => Number.isFinite(v));
  const lows = candles.map((c) => c.low).filter((v) => Number.isFinite(v));
  const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v));

  return {
    asset: {
      symbol: spot.symbol,
      name: spot.name,
      id: spot.id,
    },
    spot: {
      priceUsd: spot.priceUsd,
      change24h: spot.changePercent24Hr,
      marketCapUsd: spot.marketCapUsd,
    },
    technicals: {
      high24h: highs.length ? Math.max(...highs) : null,
      low24h: lows.length ? Math.min(...lows) : null,
      rsi14: calculateRSI(closes, 14),
      candles,
    },
    liquidity,
    sentiment,
  };
}

export async function getMarketData(symbol: string) {
  return getCoinInfo(symbol);
}

export async function getCandles(symbol: string, limit = 30) {
  return getOHLC(symbol, limit);
}