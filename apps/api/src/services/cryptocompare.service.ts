import axios from "axios";
import { env } from "../config/env";
import { TTLCache } from "../utils/cache";

export type CryptoCompareInterval = "1m" | "5m" | "15m" | "30m" | "1H" | "4H" | "1D";

export type CryptoCompareCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeFrom: number;
  volumeTo: number;
};

const BASE_URL = "https://min-api.cryptocompare.com/data/v2";
const MAX_LIMIT = 2000;
const DEFAULT_EXCHANGE = "CCCAGG";
const cache = new TTLCache<unknown>();

function cacheKey(parts: Array<string | number>) {
  return parts.join(":");
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function mapRows(rows: any[]): CryptoCompareCandle[] {
  return rows
    .map((row) => {
      const time = toNumber(row?.time);
      const open = toNumber(row?.open);
      const high = toNumber(row?.high);
      const low = toNumber(row?.low);
      const close = toNumber(row?.close);
      const volumeFrom = toNumber(row?.volumefrom) ?? 0;
      const volumeTo = toNumber(row?.volumeto) ?? 0;

      if (time === null || open === null || high === null || low === null || close === null) {
        return null;
      }

      return {
        time: time * 1000,
        open,
        high,
        low,
        close,
        volumeFrom,
        volumeTo,
      } satisfies CryptoCompareCandle;
    })
    .filter((item): item is CryptoCompareCandle => item !== null)
    .sort((a, b) => a.time - b.time);
}

function dedupeCandles(candles: CryptoCompareCandle[]): CryptoCompareCandle[] {
  const unique = new Map<number, CryptoCompareCandle>();
  for (const candle of candles) {
    unique.set(candle.time, candle);
  }
  return Array.from(unique.values()).sort((a, b) => a.time - b.time);
}

function getIntervalConfig(interval: CryptoCompareInterval) {
  switch (interval) {
    case "1m":
      return { endpoint: "/histominute", aggregate: 1, ttlMs: 30_000 };
    case "5m":
      return { endpoint: "/histominute", aggregate: 5, ttlMs: 30_000 };
    case "15m":
      return { endpoint: "/histominute", aggregate: 15, ttlMs: 45_000 };
    case "30m":
      return { endpoint: "/histominute", aggregate: 30, ttlMs: 45_000 };
    case "1H":
      return { endpoint: "/histohour", aggregate: 1, ttlMs: 60_000 };
    case "4H":
      return { endpoint: "/histohour", aggregate: 4, ttlMs: 90_000 };
    case "1D":
      return { endpoint: "/histoday", aggregate: 1, ttlMs: 5 * 60_000 };
    default:
      return { endpoint: "/histohour", aggregate: 1, ttlMs: 60_000 };
  }
}

async function requestBatch(
  fsym: string,
  tsym: string,
  interval: CryptoCompareInterval,
  limit: number,
  toTs?: number
): Promise<CryptoCompareCandle[]> {
  const { endpoint } = getIntervalConfig(interval);
  const params: Record<string, string | number | boolean> = {
    fsym,
    tsym,
    e: DEFAULT_EXCHANGE,
    limit,
    aggregate: getIntervalConfig(interval).aggregate,
    aggregatePredictableTimePeriods: true,
    tryConversion: false,
  };

  if (typeof toTs === "number" && Number.isFinite(toTs)) {
    params.toTs = toTs;
  }

  if (env.CRYPTOCOMPARE_API_KEY) {
    params.api_key = env.CRYPTOCOMPARE_API_KEY;
  }

  const response = await axios.get(`${BASE_URL}${endpoint}`, {
    params,
    timeout: 20_000,
  });

  const payload = response.data;
  const rows = Array.isArray(payload?.Data?.Data)
    ? payload.Data.Data
    : Array.isArray(payload?.Data)
      ? payload.Data
      : [];

  return mapRows(rows);
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

export async function getCryptoCompareCandles(
  fsym: string,
  tsym: string,
  interval: CryptoCompareInterval,
  requestedLimit: number
): Promise<CryptoCompareCandle[]> {
  const { ttlMs } = getIntervalConfig(interval);
  const limit = Math.max(1, requestedLimit);
  const key = cacheKey(["cryptocompare", fsym, tsym, interval, limit]);

  return getCached(key, ttlMs, async () => {
    const candles: CryptoCompareCandle[] = [];
    let remaining = limit;
    let toTs: number | undefined;
    let guard = 0;

    while (remaining > 0 && guard < 20) {
      const batchLimit = Math.min(MAX_LIMIT, Math.max(1, remaining));
      const batch = await requestBatch(fsym, tsym, interval, batchLimit, toTs);
      if (!batch.length) break;

      candles.unshift(...batch);
      remaining -= batch.length;

      const earliest = batch[0];
      if (!earliest) break;
      toTs = Math.floor(earliest.time / 1000) - 1;

      if (batch.length < batchLimit) break;
      guard += 1;
    }

    return dedupeCandles(candles).slice(-limit);
  });
}
