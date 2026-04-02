import axios from "axios";
import { TTLCache } from "../utils/cache";

export type PionexInterval = "1M" | "5M" | "15M" | "30M" | "60M" | "4H" | "8H" | "12H" | "1D";

export type PionexCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number;
};

export type PionexTicker = {
  symbol: string;
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
  bidPrice: number;
  bidSize: number;
  askPrice: number;
  askSize: number;
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

const BASE_URL = "https://api.pionex.com/api/v1/market";
const cache = new TTLCache<unknown>();

function buildSymbol(baseSymbol: string, quoteSymbol = "USDT"): string {
  return `${baseSymbol.trim().toUpperCase()}_${quoteSymbol.trim().toUpperCase()}`;
}

function cacheKey(parts: Array<string | number>): string {
  return parts.join(":");
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

function sumNotional(levels: PionexDepthLevel[], limit: number): number {
  return levels.slice(0, limit).reduce((acc, level) => acc + level.price * level.size, 0);
}

async function getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) {
    return cached as T;
  }

  const value = await fetcher();
  cache.set(key, value, ttlMs);
  return value;
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

function mapCandle(row: any): PionexCandle | null {
  if (Array.isArray(row)) {
    const time = normalizeTime(row[0]);
    const open = normalizeNumber(row[1]);
    const high = normalizeNumber(row[2]);
    const low = normalizeNumber(row[3]);
    const close = normalizeNumber(row[4]);
    const volume = normalizeNumber(row[5]) ?? 0;
    const amount = normalizeNumber(row[6]) ?? 0;

    if (time === null || open === null || high === null || low === null || close === null) {
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

  if (time === null || open === null || high === null || low === null || close === null) {
    return null;
  }

  return { time, open, high, low, close, volume, amount };
}

function mapDepthSide(side: any[]): PionexDepthLevel[] {
  return side
    .map((level) => {
      if (Array.isArray(level)) {
        const price = normalizeNumber(level[0]);
        const size = normalizeNumber(level[1]);
        if (price === null || size === null || price <= 0 || size <= 0) return null;
        return { price, size };
      }

      const price = normalizeNumber(level?.price ?? level?.[0]);
      const size = normalizeNumber(level?.size ?? level?.quantity ?? level?.qty ?? level?.[1]);
      if (price === null || size === null || price <= 0 || size <= 0) return null;
      return { price, size };
    })
    .filter((item): item is PionexDepthLevel => item !== null);
}

export async function getPionexKlines(
  baseSymbol: string,
  quoteSymbol = "USDT",
  interval: PionexInterval = "1D",
  limit = 100
): Promise<PionexCandle[]> {
  const symbol = buildSymbol(baseSymbol, quoteSymbol);
  const key = cacheKey(["pionex", "klines", symbol, interval, limit]);

  return getCached(key, 30_000, async () => {
    const response = await axios.get(`${BASE_URL}/klines`, {
      params: {
        symbol,
        interval,
        limit: Math.max(1, Math.min(limit, 500))
      },
      timeout: 12_000
    });

    const rows = unwrapArrayPayload(response.data, ["klines", "items", "data"]);

    return rows
      .map((row) => mapCandle(row))
      .filter((item): item is PionexCandle => item !== null)
      .sort((a, b) => a.time - b.time);
  });
}

export async function getPionexTicker(
  baseSymbol: string,
  quoteSymbol = "USDT"
): Promise<PionexTicker> {
  const symbol = buildSymbol(baseSymbol, quoteSymbol);
  const key = cacheKey(["pionex", "ticker", symbol]);

  return getCached(key, 10_000, async () => {
    const response = await axios.get(`${BASE_URL}/tickers`, {
      params: {
        symbol,
        type: "SPOT"
      },
      timeout: 10_000
    });

    const rows = unwrapArrayPayload(response.data, ["tickers"]);
    const raw = rows.find((item) => item?.symbol === symbol) ?? rows[0] ?? response.data?.data?.ticker;

    if (!raw) {
      throw new Error(`Pionex returned empty ticker for ${symbol}`);
    }

    const open = normalizeNumber(raw.open);
    const close = normalizeNumber(raw.close);
    const high = normalizeNumber(raw.high);
    const low = normalizeNumber(raw.low);

    if (open === null || close === null || high === null || low === null || close <= 0) {
      throw new Error(`Pionex returned invalid ticker for ${symbol}`);
    }

    const changePercent24h = open > 0 ? ((close - open) / open) * 100 : null;

    return {
      symbol,
      open,
      close,
      high,
      low,
      volume: normalizeNumber(raw.volume) ?? 0,
      amount: normalizeNumber(raw.amount) ?? 0,
      count: normalizeNumber(raw.count),
      changePercent24h,
      time: normalizeTime(raw.time)
    };
  });
}

export async function getPionexBookTicker(
  baseSymbol: string,
  quoteSymbol = "USDT"
): Promise<PionexBookTicker> {
  const symbol = buildSymbol(baseSymbol, quoteSymbol);
  const key = cacheKey(["pionex", "bookTicker", symbol]);

  return getCached(key, 5_000, async () => {
    const response = await axios.get(`${BASE_URL}/bookTickers`, {
      params: {
        symbol,
        type: "SPOT"
      },
      timeout: 10_000
    });

    const rows = unwrapArrayPayload(response.data, ["bookTickers", "tickers"]);
    const raw = rows.find((item) => item?.symbol === symbol) ?? rows[0] ?? response.data?.data?.bookTicker;

    const bidPrice = normalizeNumber(raw?.bidPrice ?? raw?.bid);
    const bidSize = normalizeNumber(raw?.bidSize ?? raw?.bidQty ?? raw?.bidQuantity);
    const askPrice = normalizeNumber(raw?.askPrice ?? raw?.ask);
    const askSize = normalizeNumber(raw?.askSize ?? raw?.askQty ?? raw?.askQuantity);

    if (
      bidPrice === null ||
      askPrice === null ||
      bidPrice <= 0 ||
      askPrice <= 0 ||
      askPrice < bidPrice
    ) {
      throw new Error(`Pionex returned invalid book ticker for ${symbol}`);
    }

    return {
      symbol,
      bidPrice,
      bidSize: bidSize ?? 0,
      askPrice,
      askSize: askSize ?? 0
    };
  });
}

export async function getPionexDepth(
  baseSymbol: string,
  quoteSymbol = "USDT",
  limit = 20
): Promise<PionexDepth> {
  const symbol = buildSymbol(baseSymbol, quoteSymbol);
  const key = cacheKey(["pionex", "depth", symbol, limit]);

  return getCached(key, 5_000, async () => {
    const response = await axios.get(`${BASE_URL}/depth`, {
      params: {
        symbol,
        limit: Math.max(5, Math.min(limit, 200))
      },
      timeout: 10_000
    });

    const raw = response.data?.data ?? response.data;
    const bids = mapDepthSide(Array.isArray(raw?.bids) ? raw.bids : []);
    const asks = mapDepthSide(Array.isArray(raw?.asks) ? raw.asks : []);

    if (!bids.length || !asks.length) {
      throw new Error(`Pionex returned invalid depth for ${symbol}`);
    }

    return {
      bids,
      asks,
      updateTime: normalizeTime(raw?.updateTime)
    };
  });
}

export function getOrderBookNotional(depth: PionexDepth, levels = 10) {
  return {
    bidNotionalUsd: sumNotional(depth.bids, levels),
    askNotionalUsd: sumNotional(depth.asks, levels)
  };
}