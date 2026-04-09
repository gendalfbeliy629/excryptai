const WEB_API_BASE_URL = "/backend";

type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export type Candle = {
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

export type MarketListItem = {
  symbol: string;
  name: string;
  pair: string;
  priceUsd: number | null;
  change24h: number | null;
  change30d: number | null;
  trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
  rsi14: number | null;
  signal: "BUY" | "HOLD" | "SELL";
  score: number;
  volume24h?: number;
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
    scanMode?: string;
  };
  generatedAt: string | null;
  buyCommandText: string;
  scanMode: "soft" | "hard";
  degraded?: boolean;
};

export type DashboardBootstrapStatus = {
  buySignalsCacheReady: boolean;
  buySignalsCacheWarming: boolean;
  cacheAgeMs: number | null;
  cacheExpiresInMs?: number | null;
  warmedAt: string | null;
  scanMode?: string | null;
};

export type RefreshBuySignalsResponse = DashboardBootstrapStatus & {
  refreshedAt: string;
};

export type MarketsResponse = {
  items: MarketListItem[];
  total: number;
  degraded?: boolean;
};


export type MarketCandlesResponse = {
  symbol: string;
  interval: "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D";
  candles: Candle[];
  hasMore: boolean;
  nextBeforeTime: number | null;
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
      historySource?: "PIONEX";
    };
    spot: {
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
      sma7: number | null;
      sma30: number | null;
      ema20: number | null;
      ema50: number | null;
      macdLine: number | null;
      macdSignal: number | null;
      macdHistogram: number | null;
      trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
      candles: Candle[];
      intraday1m?: {
        candles: Candle[];
      };
      intraday5m?: {
        candles: Candle[];
      };
      intraday15m?: {
        candles: Candle[];
      };
      intraday30m?: {
        candles: Candle[];
      };
      intraday1h?: {
        candles: Candle[];
        rsi14: number | null;
        ema20: number | null;
        ema50: number | null;
        atr14: number | null;
        macdLine: number | null;
        macdSignal: number | null;
        macdHistogram: number | null;
      };
      intraday4h?: {
        candles: Candle[];
        rsi14: number | null;
        ema20: number | null;
        ema50: number | null;
        atr14: number | null;
        macdLine: number | null;
        macdSignal: number | null;
        macdHistogram: number | null;
      };
      structure?: {
        nearestResistance: number | null;
        nextResistance: number | null;
        nearestSupport: number | null;
        secondarySupport: number | null;
        roomToResistancePercent: number | null;
      };
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
    priceUsd: number | null;
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
    entryZoneLow: number | null;
    entryZoneHigh: number | null;
    breakEvenActivationPrice: number | null;
    trailingAtrMultiplier: number;
    protectiveStop: number | null;
    invalidationLevel: number | null;
    target1DistancePercent: number | null;
    entryConfirmationText: string;
    confirmationLevel: number | null;
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

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed.replace(/\/$/, "");
  }

  return `https://${trimmed.replace(/^\/+/, "").replace(/\/$/, "")}`;
}

async function resolveApiBaseUrl(): Promise<string> {
  if (typeof window !== "undefined") {
    return WEB_API_BASE_URL;
  }

  const envOrigin =
    normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeOrigin(process.env.APP_URL) ||
    normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeOrigin(process.env.SITE_URL) ||
    normalizeOrigin(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    normalizeOrigin(process.env.VERCEL_URL);

  if (envOrigin) {
    return `${envOrigin}${WEB_API_BASE_URL}`;
  }

  try {
    const { headers } = await import("next/headers");
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host");
    const proto =
      requestHeaders.get("x-forwarded-proto") ||
      (host && (host.includes("localhost") || host.startsWith("127.0.0.1")) ? "http" : "https");

    if (host) {
      return `${proto}://${host}${WEB_API_BASE_URL}`;
    }
  } catch {
    // ignore
  }

  return `http://127.0.0.1:${process.env.PORT || "3000"}${WEB_API_BASE_URL}`;
}

async function fetchApi<T>(path: string, init?: RequestInit): Promise<T> {
  const apiBaseUrl = await resolveApiBaseUrl();

  const response = await fetch(`${apiBaseUrl}${path}`, {
    cache: "no-store",
    ...init
  });

  if (!response.ok) {
    let errorMessage = `API request failed: ${response.status} ${response.statusText}`;

    try {
      const payload = (await response.json()) as ApiEnvelope<T>;
      if (payload?.error) {
        errorMessage = payload.error;
      }
    } catch {
      // ignore
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

export async function getDashboardBootstrapStatus(
  mode: "soft" | "hard" = "soft"
): Promise<DashboardBootstrapStatus> {
  return fetchApi<DashboardBootstrapStatus>(`/dashboard/bootstrap-status?mode=${mode}`);
}

export async function refreshBuySignalsCache(
  mode: "soft" | "hard" = "soft"
): Promise<RefreshBuySignalsResponse> {
  return fetchApi<RefreshBuySignalsResponse>(`/dashboard/refresh-cache?mode=${mode}`);
}

export async function getDashboardData(
  mode: "soft" | "hard" = "soft"
): Promise<DashboardData> {
  return fetchApi<DashboardData>(`/dashboard?mode=${mode}`);
}

export async function getMarkets(limit = 30): Promise<MarketsResponse> {
  return fetchApi<MarketsResponse>(`/markets?limit=${limit}`);
}

export async function getMarketDetail(symbol: string): Promise<MarketDetail> {
  return fetchApi<MarketDetail>(`/markets/${encodeURIComponent(symbol)}`);
}

export async function getMarketCandles(
  symbol: string,
  interval: "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D",
  limit = 200,
  beforeTime?: number
): Promise<MarketCandlesResponse> {
  const params = new URLSearchParams({
    interval,
    limit: String(limit)
  });

  if (typeof beforeTime === "number" && Number.isFinite(beforeTime)) {
    params.set("beforeTime", String(Math.floor(beforeTime)));
  }

  return fetchApi<MarketCandlesResponse>(`/markets/${encodeURIComponent(symbol)}/candles?${params.toString()}`);
}

export async function getInfoCard(symbol: string): Promise<InfoResponse> {
  return fetchApi<InfoResponse>(`/info/${encodeURIComponent(symbol)}`);
}

export async function getAiAnalysis(symbol: string): Promise<AiResponse> {
  return fetchApi<AiResponse>(`/ai/${encodeURIComponent(symbol)}`);
}

export async function safeGetDashboardData(
  mode: "soft" | "hard" = "soft"
): Promise<ApiResult<DashboardData>> {
  return safeFetchApi<DashboardData>(`/dashboard?mode=${mode}`);
}

export async function safeGetMarkets(limit = 30): Promise<ApiResult<MarketsResponse>> {
  return safeFetchApi<MarketsResponse>(`/markets?limit=${limit}`);
}

export async function safeGetMarketDetail(symbol: string): Promise<ApiResult<MarketDetail>> {
  return safeFetchApi<MarketDetail>(`/markets/${encodeURIComponent(symbol)}`);
}