import { getJson, setJson } from "../lib/redis";
import { buildMarketContext, type BuildMarketContextOptions, type MarketContext } from "./market.service";
import { type BuyScanMode, type SignalEvaluation, evaluateMarketSignal } from "./signal.service";

const MARKET_CONTEXT_TTL_MS = 2 * 60 * 1000;
const MARKET_CONTEXT_STALE_WINDOW_MS = 8 * 60 * 1000;
export const SIGNAL_CACHE_TTL_MS = 2 * 60 * 1000;
const SIGNAL_CACHE_STALE_WINDOW_MS = 8 * 60 * 1000;

type CacheEnvelope<T> = {
  value: T;
  cachedAt: number;
  expiresAt: number;
  staleExpiresAt: number;
};

function toPairKey(baseSymbol: string, quoteSymbol: string): string {
  return `${baseSymbol.toUpperCase()}/${quoteSymbol.toUpperCase()}`;
}

function getValidEnvelope<T>(entry: CacheEnvelope<T> | null): CacheEnvelope<T> | null {
  if (!entry) return null;
  return Date.now() > entry.staleExpiresAt ? null : entry;
}

async function setEnvelope<T>(key: string, value: T, ttlMs: number, staleWindowMs: number) {
  const cachedAt = Date.now();
  const entry: CacheEnvelope<T> = {
    value,
    cachedAt,
    expiresAt: cachedAt + ttlMs,
    staleExpiresAt: cachedAt + ttlMs + staleWindowMs
  };

  await setJson(key, entry, ttlMs + staleWindowMs);
}

export async function getCachedMarketContext(
  baseSymbol: string,
  quoteSymbol = "USDT",
  options: BuildMarketContextOptions = {}
): Promise<MarketContext> {
  const key = `market-context:${toPairKey(baseSymbol, quoteSymbol)}`;
  const cached = getValidEnvelope(await getJson<CacheEnvelope<MarketContext>>(key));

  if (cached) {
    return cached.value;
  }

  const value = await buildMarketContext(baseSymbol, quoteSymbol, options);
  await setEnvelope(key, value, MARKET_CONTEXT_TTL_MS, MARKET_CONTEXT_STALE_WINDOW_MS);
  return value;
}

export async function getCachedSignalEvaluation(
  market: MarketContext,
  mode: BuyScanMode = "hard"
): Promise<SignalEvaluation | null> {
  const key = `signal:${mode}:${market.pair.display}`;
  const cached = getValidEnvelope(await getJson<CacheEnvelope<SignalEvaluation | null>>(key));

  if (cached) {
    return cached.value;
  }

  const value = evaluateMarketSignal(market, mode);
  await setEnvelope(key, value, SIGNAL_CACHE_TTL_MS, SIGNAL_CACHE_STALE_WINDOW_MS);
  return value;
}
