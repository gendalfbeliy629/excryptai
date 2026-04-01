const API_BASE_URL = (
  process.env.API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:4000/api"
).replace(/\/$/, "");

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type MarketListItem = {
  symbol: string;
  name: string;
  pair: string;
  priceUsd: number;
  change24h: number | null;
  change30d: number | null;
  trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
  rsi14: number | null;
  signal: "BUY" | "HOLD" | "SELL";
  score: number;
};

export type BuyCandidate = {
  rank: number;
  pair: string;
  symbol: string;
  name: string;
  priceUsd: number;
  buyPriceUsd: number;
  initialStopLossUsd: number;
  breakEvenPriceUsd: number;
  trailingStopAfterTp1Usd: number;
  trailingStopPercent: number;
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
  change24h: number | null;
  change30d: number | null;
  trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
  rsi14: number | null;
  score: number;
  signal: "BUY";
  reason: string;
  managementPlan: string[];
};

export type DashboardData = {
  featured: MarketListItem[];
  topBuys: BuyCandidate[];
  summary: {
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
};

export type MarketsResponse = {
  items: MarketListItem[];
  total: number;
};

export type MarketDetail = {
  market: {
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
      trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
      candles: {
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
        volumeFrom?: number;
        volumeTo?: number;
      }[];
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
  signal: {
    pair: string;
    symbol: string;
    name: string;
    priceUsd: number;
    change24h: number | null;
    change30d: number | null;
    trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
    rsi14: number | null;
    high30d: number | null;
    low30d: number | null;
    sma7: number | null;
    sma30: number | null;
    rangePosition: number | null;
    pullbackFromHigh: number | null;
    score: number;
    signal: "BUY" | "HOLD" | "SELL";
    reason: string;
    positives: string[];
    negatives: string[];
  };
};

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!payload.success) {
    throw new Error(payload.error || "API returned unsuccessful response");
  }

  return payload.data;
}

export async function getDashboardData(): Promise<DashboardData> {
  return fetchApi<DashboardData>("/dashboard");
}

export async function getMarkets(limit = 12): Promise<MarketsResponse> {
  return fetchApi<MarketsResponse>(`/markets?limit=${limit}`);
}

export async function getMarketDetail(symbol: string): Promise<MarketDetail> {
  return fetchApi<MarketDetail>(`/markets/${encodeURIComponent(symbol)}`);
}