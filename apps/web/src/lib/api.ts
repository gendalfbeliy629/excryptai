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
  trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
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

export type DashboardData = {
  featured: MarketListItem[];
  topBuys: BuyCandidate[];
  summary: {
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
    failedDetails: Array<{
      pair: string;
      reason: string;
    }>;
  };
  degraded?: boolean;
};

export type MarketsResponse = {
  items: MarketListItem[];
  total: number;
  degraded?: boolean;
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
      price: number;
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
    atr1h: number | null;
    atr1hPercent: number | null;
    nearestResistance: number | null;
    nextResistance: number | null;
    nearestSupport: number | null;
    roomToResistancePercent: number | null;
    entryZoneLow: number | null;
    entryZoneHigh: number | null;
    breakEvenActivationPrice: number | null;
    trailingAtrMultiplier: number;
    protectiveStop: number | null;
    invalidationLevel: number | null;
    target1DistancePercent: number | null;
    entryConfirmationStatus: string;
    entryConfirmationStrategy: string;
    entryConfirmationText: string;
    confirmationLevel: number | null;
    confirmationRetestLevel: number | null;
    confirmationBreakoutLevel: number | null;
    lastClosed1hCandleTime: number | null;
    lastClosed1hCandleClose: number | null;
  };
};

export type InfoResponse = {
  symbol: string;
  pair: string;
  text: string;
};

export type AiResponse = {
  symbol: string;
  pair: string;
  text: string;
};

export type ApiResult<T> = {
  data: T | null;
  error: string | null;
};

async function fetchApi<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;

    try {
      const payload = (await response.json()) as ApiEnvelope<T>;
      if (payload?.error) {
        errorMessage = payload.error;
      }
    } catch {
      // ignore json parse failure
    }

    throw new Error(errorMessage);
  }

  const payload = (await response.json()) as ApiEnvelope<T>;

  if (!payload.success) {
    throw new Error(payload.error || "API returned unsuccessful response");
  }

  return payload.data;
}

async function safeFetchApi<T>(path: string): Promise<ApiResult<T>> {
  try {
    const data = await fetchApi<T>(path);
    return {
      data,
      error: null
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown API error"
    };
  }
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

export async function getInfoCard(symbol: string): Promise<InfoResponse> {
  return fetchApi<InfoResponse>(`/info/${encodeURIComponent(symbol)}`);
}

export async function getAiAnalysis(symbol: string): Promise<AiResponse> {
  return fetchApi<AiResponse>(`/ai/${encodeURIComponent(symbol)}`);
}

export async function safeGetDashboardData(): Promise<ApiResult<DashboardData>> {
  return safeFetchApi<DashboardData>("/dashboard");
}

export async function safeGetMarkets(limit = 12): Promise<ApiResult<MarketsResponse>> {
  return safeFetchApi<MarketsResponse>(`/markets?limit=${limit}`);
}

export async function safeGetMarketDetail(symbol: string): Promise<ApiResult<MarketDetail>> {
  return safeFetchApi<MarketDetail>(`/markets/${encodeURIComponent(symbol)}`);
}