import axios, { AxiosError } from "axios";
import { TTLCache } from "../utils/cache";
import { SlidingWindowRateLimiter } from "../utils/rate-limiter";

export type PionexInterval =
  | "1M"
  | "5M"
  | "15M"
  | "30M"
  | "60M"
  | "4H"
  | "8H"
  | "12H"
  | "1D";

export type PionexTicker = {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  count: number | null;
  changePercent24h: number | null;
  time: number | null;
};

export type PionexBookTicker = {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
  timestamp: number | null;
};

export type PionexDepthLevel = {
  price: number;
  size: number;
};

export type PionexDepth = {
  bids: PionexDepthLevel[];
  asks: PionexDepthLevel[];
  updateTime: number | null;
};

export type PionexCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
};

export type PionexSpotMarket = {
  symbol: string;
  baseSymbol: string;
  quoteSymbol: string;
};

const BASE_URL = "https://api.pionex.com/api/v1/market";

/**
 * Ниже потолка Pionex 10 req/s.
 * Держим 7 req/s + cooldown на 429.
 */
const limiter = new SlidingWindowRateLimiter(7, 1000);

const cache = new TTLCache<unknown>();

function cacheKey(parts: Array<string | number>): string {
  return parts.join(":");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeTime(value: unknown): number | null {
  const parsed = normalizeNumber(value);
  if (parsed === null) return null;
  return parsed > 10_000_000_000 ? parsed : parsed * 1000;
}

function splitMarketSymbol(symbol: string): PionexSpotMarket | null {
  if (typeof symbol !== "string") return null;

  const parts = symbol.split("_");
  if (parts.length !== 2) return null;

  const [baseSymbol, quoteSymbol] = parts.map((item) => item.trim().toUpperCase());

  if (!baseSymbol || !quoteSymbol) return null;

  return {
    symbol: `${baseSymbol}_${quoteSymbol}`,
    baseSymbol,
    quoteSymbol,
  };
}

function unwrapArrayPayload(payload: any, possibleKeys: string[]): any[] {
  for (const key of possibleKeys) {
    const value = payload?.data?.[key] ?? payload?.[key] ?? payload?.data;
    if (Array.isArray(value)) {
      return value;
    }
  }

  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

async function requestWithLimiter<T>(
  endpoint: string,
  params: Record<string, unknown>,
  retries = 2
): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      return await limiter.schedule(async () => {
        const response = await axios.get(`${BASE_URL}${endpoint}`, {
          params,
          timeout: 15000,
        });

        return response.data as T;
      });
    } catch (error) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;

      if (status === 429 && attempt < retries) {
        attempt += 1;
        limiter.setCooldown(65_000);
        await sleep(65_000);
        continue;
      }

      throw error;
    }
  }
}

async function getCached<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = cache.get(key);
  if (cached) {
    return cached as T;
  }

  const value = await fetcher();
  cache.set(key, value, ttlMs);
  return value;
}

function mapTicker(row: any): PionexTicker | null {
  const market = splitMarketSymbol(row?.symbol);
  if (!market) return null;

  const open = normalizeNumber(row?.open);
  const close = normalizeNumber(row?.close);
  const high = normalizeNumber(row?.high);
  const low = normalizeNumber(row?.low);

  if (open === null || close === null || high === null || low === null) {
    return null;
  }

  return {
    symbol: market.symbol,
    baseSymbol: market.baseSymbol,
    quoteSymbol: market.quoteSymbol,
    open,
    close,
    high,
    low,
    volume: normalizeNumber(row?.volume) ?? 0,
    amount: normalizeNumber(row?.amount) ?? 0,
    count: normalizeNumber(row?.count),
    changePercent24h: open > 0 ? ((close - open) / open) * 100 : null,
    time: normalizeTime(row?.time),
  };
}

function mapBookTicker(row: any): PionexBookTicker | null {
  const market = splitMarketSymbol(row?.symbol);
  if (!market) return null;

  const bidPrice = normalizeNumber(row?.bidPrice ?? row?.bid);
  const askPrice = normalizeNumber(row?.askPrice ?? row?.ask);

  if (
    bidPrice === null ||
    askPrice === null ||
    bidPrice <= 0 ||
    askPrice <= 0 ||
    askPrice < bidPrice
  ) {
    return null;
  }

  return {
    symbol: market.symbol,
    baseSymbol: market.baseSymbol,
    quoteSymbol: market.quoteSymbol,
    bidPrice,
    bidSize: normalizeNumber(row?.bidSize ?? row?.bidQty ?? row?.bidQuantity) ?? 0,
    askPrice,
    askSize: normalizeNumber(row?.askSize ?? row?.askQty ?? row?.askQuantity) ?? 0,
    timestamp: normalizeTime(row?.timestamp ?? row?.time),
  };
}

function mapDepthSide(side: any[]): PionexDepthLevel[] {
  return side
    .map((level) => {
      if (Array.isArray(level)) {
        const price = normalizeNumber(level[0]);
        const size = normalizeNumber(level[1]);

        if (price === null || size === null || price <= 0 || size <= 0) {
          return null;
        }

        return { price, size };
      }

      const price = normalizeNumber(level?.price ?? level?.[0]);
      const size = normalizeNumber(
        level?.size ?? level?.quantity ?? level?.qty ?? level?.[1]
      );

      if (price === null || size === null || price <= 0 || size <= 0) {
        return null;
      }

      return { price, size };
    })
    .filter((item): item is PionexDepthLevel => item !== null);
}

function mapCandle(row: any): PionexCandle | null {
  if (Array.isArray(row)) {
    const time = normalizeTime(row[0]);
    const open = normalizeNumber(row[1]);
    const high = normalizeNumber(row[2]);
    const low = normalizeNumber(row[3]);
    const close = normalizeNumber(row[4]);
    const volume = normalizeNumber(row[5]) ?? 0;
    const amount = normalizeNumber(row[6]) ?? 0;

    if (
      time === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null
    ) {
      return null;
    }

    return { time, open, high, low, close, volume, amount };
  }

  const time = normalizeTime(row?.time ?? row?.openTime ?? row?.t);
  const open = normalizeNumber(row?.open ?? row?.o);
  const high = normalizeNumber(row?.high ?? row?.h);
  const low = normalizeNumber(row?.low ?? row?.l);
  const close = normalizeNumber(row?.close ?? row?.c);
  const volume = normalizeNumber(row?.volume ?? row?.v) ?? 0;
  const amount = normalizeNumber(row?.amount ?? row?.quoteVolume ?? row?.q) ?? 0;

  if (
    time === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null;
  }

  return { time, open, high, low, close, volume, amount };
}

export async function getAllPionexSpotTickers(): Promise<PionexTicker[]> {
  const key = cacheKey(["pionex", "tickers", "SPOT", "ALL"]);

  return getCached(key, 20_000, async () => {
    const payload = await requestWithLimiter<any>("/tickers", { type: "SPOT" });
    const rows = unwrapArrayPayload(payload, ["tickers"]);

    return rows
      .map((row) => mapTicker(row))
      .filter((item): item is PionexTicker => item !== null);
  });
}

export async function getAllPionexSpotBookTickers(): Promise<PionexBookTicker[]> {
  const key = cacheKey(["pionex", "bookTickers", "SPOT", "ALL"]);

  return getCached(key, 10_000, async () => {
    const payload = await requestWithLimiter<any>("/bookTickers", { type: "SPOT" });
    const rows = unwrapArrayPayload(payload, ["tickers", "bookTickers"]);

    return rows
      .map((row) => mapBookTicker(row))
      .filter((item): item is PionexBookTicker => item !== null);
  });
}

export async function getAllPionexSpotMarkets(): Promise<PionexSpotMarket[]> {
  const tickers = await getAllPionexSpotTickers();

  return tickers.map((item) => ({
    symbol: item.symbol,
    baseSymbol: item.baseSymbol,
    quoteSymbol: item.quoteSymbol,
  }));
}

export async function getPionexKlines(
  baseSymbol: string,
  quoteSymbol: string,
  interval: PionexInterval,
  limit: number,
  endTime?: number
): Promise<PionexCandle[]> {
  const symbol = `${baseSymbol}_${quoteSymbol}`;
  const normalizedLimit = Math.max(1, Math.min(limit, 500));
  const normalizedEndTime = typeof endTime === "number" && Number.isFinite(endTime) ? Math.floor(endTime) : "latest";
  const key = cacheKey(["pionex", "klines", symbol, interval, normalizedLimit, normalizedEndTime]);

  return getCached(key, 60_000, async () => {
    const params: Record<string, unknown> = {
      symbol,
      interval,
      limit: normalizedLimit,
    };

    if (typeof endTime === "number" && Number.isFinite(endTime)) {
      params.endTime = Math.floor(endTime);
    }

    const payload = await requestWithLimiter<any>("/klines", params);

    const rows = unwrapArrayPayload(payload, ["klines", "items", "data"]);

    return rows
      .map((row) => mapCandle(row))
      .filter((item): item is PionexCandle => item !== null)
      .sort((a, b) => a.time - b.time);
  });
}

export async function getPionexDepth(
  baseSymbol: string,
  quoteSymbol: string,
  limit = 20
): Promise<PionexDepth> {
  const symbol = `${baseSymbol}_${quoteSymbol}`;
  const key = cacheKey(["pionex", "depth", symbol, limit]);

  return getCached(key, 15_000, async () => {
    const payload = await requestWithLimiter<any>("/depth", {
      symbol,
      limit: Math.max(5, Math.min(limit, 200)),
    });

    const raw = payload?.data ?? payload;
    const bids = mapDepthSide(Array.isArray(raw?.bids) ? raw.bids : []);
    const asks = mapDepthSide(Array.isArray(raw?.asks) ? raw.asks : []);

    if (!bids.length || !asks.length) {
      throw new Error(`Invalid depth for ${symbol}`);
    }

    return {
      bids,
      asks,
      updateTime: normalizeTime(raw?.updateTime),
    };
  });
}

export function getOrderBookNotional(depth: PionexDepth, levels = 10) {
  const bidNotional = depth.bids
    .slice(0, levels)
    .reduce((acc, level) => acc + level.price * level.size, 0);

  const askNotional = depth.asks
    .slice(0, levels)
    .reduce((acc, level) => acc + level.price * level.size, 0);

  return {
    bidNotional,
    askNotional,
  };
}