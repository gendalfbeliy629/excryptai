import { buildMarketContext, MarketContext, TrendType } from "./market.service";
import { SYMBOL_TO_COINCAP_ID } from "../utils/symbols";

type BuySignal = "BUY" | "HOLD";

export type BuyCandidate = {
  rank: number;
  pair: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number | null;
  change30d: number | null;
  trend30d: TrendType;
  rsi14: number | null;
  score: number;
  signal: BuySignal;
  reason: string;
};

type ScoredCandidate = Omit<BuyCandidate, "rank">;

const CANDIDATE_SYMBOLS = Object.keys(SYMBOL_TO_COINCAP_ID);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function getRangePosition(
  price: number,
  low: number | null,
  high: number | null
): number | null {
  if (
    low === null ||
    high === null ||
    !Number.isFinite(low) ||
    !Number.isFinite(high) ||
    high <= low
  ) {
    return null;
  }

  const pos = ((price - low) / (high - low)) * 100;
  return clamp(pos, 0, 100);
}

function getPullbackFromHigh(
  price: number,
  high: number | null
): number | null {
  if (
    high === null ||
    !Number.isFinite(high) ||
    high <= 0 ||
    price <= 0
  ) {
    return null;
  }

  return ((high - price) / high) * 100;
}

function scoreTrend(trend: TrendType): number {
  if (trend === "BULLISH") return 25;
  if (trend === "SIDEWAYS") return 10;
  return -20;
}

function scoreChange30d(change30d: number | null): number {
  if (change30d === null || !Number.isFinite(change30d)) return 0;

  if (change30d >= 5 && change30d <= 25) return 22;
  if (change30d > 25 && change30d <= 40) return 15;
  if (change30d >= 0 && change30d < 5) return 10;
  if (change30d > -5 && change30d < 0) return 2;
  if (change30d < -20) return -18;
  return -8;
}

function scoreRsi(rsi: number | null): number {
  if (rsi === null || !Number.isFinite(rsi)) return 0;

  if (rsi >= 48 && rsi <= 62) return 18;
  if (rsi > 62 && rsi <= 68) return 10;
  if (rsi >= 40 && rsi < 48) return 8;
  if (rsi > 68 && rsi <= 75) return -6;
  if (rsi < 35) return -4;

  return 0;
}

function scoreRangePosition(position: number | null): number {
  if (position === null || !Number.isFinite(position)) return 0;

  if (position >= 35 && position <= 65) return 16;
  if (position > 65 && position <= 80) return 8;
  if (position >= 20 && position < 35) return 10;
  if (position > 80) return -10;
  if (position < 15) return -6;

  return 0;
}

function scorePullback(pullbackFromHigh: number | null): number {
  if (
    pullbackFromHigh === null ||
    !Number.isFinite(pullbackFromHigh)
  ) {
    return 0;
  }

  if (pullbackFromHigh >= 4 && pullbackFromHigh <= 15) return 10;
  if (pullbackFromHigh > 15 && pullbackFromHigh <= 25) return 4;
  if (pullbackFromHigh >= 0 && pullbackFromHigh < 4) return -6;
  if (pullbackFromHigh > 30) return -8;

  return 0;
}

function scoreSmaPosition(price: number, sma30: number | null): number {
  if (sma30 === null || !Number.isFinite(sma30) || sma30 <= 0) return 0;

  if (price > sma30) return 10;
  if (price === sma30) return 2;
  return -10;
}

function scoreLiquidity(totalTvlUsd: number | null): number {
  if (totalTvlUsd === null || !Number.isFinite(totalTvlUsd) || totalTvlUsd <= 0) {
    return 0;
  }

  if (totalTvlUsd >= 10_000_000_000) return 10;
  if (totalTvlUsd >= 1_000_000_000) return 8;
  if (totalTvlUsd >= 100_000_000) return 5;
  return 2;
}

function scoreSentiment(
  socialVolumeTotal: number | null,
  socialDominanceLatest: number | null
): number {
  let score = 0;

  if (
    socialVolumeTotal !== null &&
    Number.isFinite(socialVolumeTotal) &&
    socialVolumeTotal > 0
  ) {
    score += 3;
  }

  if (
    socialDominanceLatest !== null &&
    Number.isFinite(socialDominanceLatest) &&
    socialDominanceLatest > 0
  ) {
    score += 2;
  }

  return score;
}

function buildReason(params: {
  trend30d: TrendType;
  change30d: number | null;
  rsi14: number | null;
  rangePosition: number | null;
  pullbackFromHigh: number | null;
  totalTvlUsd: number | null;
}): string {
  const parts: string[] = [];

  if (params.trend30d === "BULLISH") {
    parts.push("бычий тренд за 30 дней");
  } else if (params.trend30d === "SIDEWAYS") {
    parts.push("нейтральный тренд без сильной слабости");
  }

  if (params.change30d !== null) {
    if (params.change30d >= 5 && params.change30d <= 25) {
      parts.push("здоровый рост за месяц");
    } else if (params.change30d > 25) {
      parts.push("сильный месячный импульс");
    }
  }

  if (params.rsi14 !== null) {
    if (params.rsi14 >= 48 && params.rsi14 <= 62) {
      parts.push("RSI в комфортной зоне");
    } else if (params.rsi14 > 62 && params.rsi14 <= 68) {
      parts.push("RSI сильный, но ещё не критичный");
    }
  }

  if (params.rangePosition !== null) {
    if (params.rangePosition >= 35 && params.rangePosition <= 65) {
      parts.push("цена в средней части диапазона 30д");
    } else if (params.rangePosition > 65 && params.rangePosition <= 80) {
      parts.push("цена выше середины диапазона");
    }
  }

  if (
    params.pullbackFromHigh !== null &&
    params.pullbackFromHigh >= 4 &&
    params.pullbackFromHigh <= 15
  ) {
    parts.push("есть умеренный откат от high 30д");
  }

  if (
    params.totalTvlUsd !== null &&
    Number.isFinite(params.totalTvlUsd) &&
    params.totalTvlUsd > 0
  ) {
    parts.push("есть подтверждение ликвидностью");
  }

  return parts.length
    ? parts.join(", ")
    : "кандидат отобран по суммарному скорингу за 30 дней";
}

function buildSignal(score: number, trend30d: TrendType): BuySignal {
  if (score >= 55 && trend30d !== "BEARISH") {
    return "BUY";
  }

  return "HOLD";
}

function scoreCandidate(market: MarketContext): ScoredCandidate | null {
  const priceUsd = market.spot.priceUsd;
  const change24h = market.spot.change24h;
  const change30d = market.technicals.change30d;
  const trend30d = market.technicals.trend30d;
  const rsi14 = market.technicals.rsi14;
  const high30d = market.technicals.high30d;
  const low30d = market.technicals.low30d;
  const sma30 = market.technicals.sma30;

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return null;
  }

  const rangePosition = getRangePosition(priceUsd, low30d, high30d);
  const pullbackFromHigh = getPullbackFromHigh(priceUsd, high30d);

  let score = 0;
  score += scoreTrend(trend30d);
  score += scoreChange30d(change30d);
  score += scoreRsi(rsi14);
  score += scoreRangePosition(rangePosition);
  score += scorePullback(pullbackFromHigh);
  score += scoreSmaPosition(priceUsd, sma30);
  score += scoreLiquidity(market.liquidity.totalTvlUsd);
  score += scoreSentiment(
    market.sentiment.socialVolumeTotal,
    market.sentiment.socialDominanceLatest
  );

  if (
    change24h !== null &&
    Number.isFinite(change24h) &&
    change24h < -8
  ) {
    score -= 8;
  }

  if (
    change24h !== null &&
    Number.isFinite(change24h) &&
    change24h > 10
  ) {
    score -= 4;
  }

  const finalScore = round(score);
  const signal = buildSignal(finalScore, trend30d);

  if (trend30d === "BEARISH" && finalScore < 50) {
    return null;
  }

  return {
    pair: `${market.asset.symbol}/USDT`,
    symbol: market.asset.symbol,
    name: market.asset.name,
    priceUsd,
    change24h,
    change30d,
    trend30d,
    rsi14,
    score: finalScore,
    signal,
    reason: buildReason({
      trend30d,
      change30d,
      rsi14,
      rangePosition,
      pullbackFromHigh,
      totalTvlUsd: market.liquidity.totalTvlUsd,
    }),
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
      const result = await worker(items[index]);
      results[index] = result;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );

  return results;
}

export async function getTopBuyPairs(limit = 10): Promise<BuyCandidate[]> {
  const scored = await mapWithConcurrency(
    CANDIDATE_SYMBOLS,
    4,
    async (symbol): Promise<ScoredCandidate | null> => {
      try {
        const market = await buildMarketContext(symbol);
        return scoreCandidate(market);
      } catch (error) {
        console.error(`Buy scoring failed for ${symbol}:`, error);
        return null;
      }
    }
  );

  return scored
    .filter((item): item is ScoredCandidate => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      ...item,
    }));
}