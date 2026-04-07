import type { BuyScanMode } from "../services/signal.service";
import type { BuyScanResult } from "../services/buy.service";

const BUY_CACHE_TTL_MS = 3 * 60 * 1000;

type BuyCacheEntry = {
  value: BuyScanResult;
  cachedAt: number;
  expiresAt: number;
};

type BuyCacheStore = {
  entries: Partial<Record<BuyScanMode, BuyCacheEntry>>;
  latestMode: BuyScanMode | null;
  warmupPromise: Promise<void> | null;
};

const buyCacheStore: BuyCacheStore = {
  entries: {},
  latestMode: null,
  warmupPromise: null
};

function getValidEntry(mode: BuyScanMode): BuyCacheEntry | null {
  const entry = buyCacheStore.entries[mode] ?? null;
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    delete buyCacheStore.entries[mode];

    if (buyCacheStore.latestMode === mode) {
      buyCacheStore.latestMode = null;
    }

    return null;
  }

  return entry;
}

function sliceResult(result: BuyScanResult, limit: number): BuyScanResult {
  return {
    ...result,
    buys: result.buys.slice(0, limit)
  };
}

export function getSharedBuyScanResult(
  limit = 5,
  preferredMode?: BuyScanMode
): BuyScanResult | null {
  if (preferredMode) {
    const preferredEntry = getValidEntry(preferredMode);
    if (preferredEntry) {
      return sliceResult(preferredEntry.value, limit);
    }
  }

  const latestMode = buyCacheStore.latestMode;
  if (latestMode) {
    const latestEntry = getValidEntry(latestMode);
    if (latestEntry) {
      return sliceResult(latestEntry.value, limit);
    }
  }

  const hardEntry = getValidEntry("hard");
  if (hardEntry) {
    buyCacheStore.latestMode = "hard";
    return sliceResult(hardEntry.value, limit);
  }

  const softEntry = getValidEntry("soft");
  if (softEntry) {
    buyCacheStore.latestMode = "soft";
    return sliceResult(softEntry.value, limit);
  }

  return null;
}

export function setSharedBuyScanResult(result: BuyScanResult): void {
  const mode = result.summary.scanMode;

  buyCacheStore.entries[mode] = {
    value: result,
    cachedAt: Date.now(),
    expiresAt: Date.now() + BUY_CACHE_TTL_MS
  };

  buyCacheStore.latestMode = mode;
}

export function getSharedBuyScanStatus() {
  const latestMode = buyCacheStore.latestMode;
  const latestEntry = latestMode ? getValidEntry(latestMode) : null;

  return {
    hasReadyCache: Boolean(latestEntry),
    latestMode: latestEntry ? latestMode : null,
    cacheAgeMs: latestEntry ? Date.now() - latestEntry.cachedAt : null,
    warmedAt: latestEntry ? new Date(latestEntry.cachedAt).toISOString() : null,
    warming: Boolean(buyCacheStore.warmupPromise)
  };
}

export function getSharedBuyScanWarmupPromise(): Promise<void> | null {
  return buyCacheStore.warmupPromise;
}

export function setSharedBuyScanWarmupPromise(promise: Promise<void> | null): void {
  buyCacheStore.warmupPromise = promise;
}