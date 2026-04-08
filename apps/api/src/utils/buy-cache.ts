import type { BuyScanMode } from "../services/signal.service";
import type { BuyScanResult } from "../services/buy.service";

const BUY_CACHE_TTL_MS = 70 * 60 * 1000;

type BuyCacheEntry = {
  value: BuyScanResult;
  cachedAt: number;
  expiresAt: number;
};

type BuyCacheStore = {
  entries: Partial<Record<BuyScanMode, BuyCacheEntry>>;
  latestMode: BuyScanMode | null;
  warmupPromises: Partial<Record<BuyScanMode, Promise<void> | null>>;
};

const buyCacheStore: BuyCacheStore = {
  entries: {},
  latestMode: null,
  warmupPromises: {}
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
    return preferredEntry ? sliceResult(preferredEntry.value, limit) : null;
  }

  const latestMode = buyCacheStore.latestMode;
  if (latestMode) {
    const latestEntry = getValidEntry(latestMode);
    if (latestEntry) {
      return sliceResult(latestEntry.value, limit);
    }
  }

  const softEntry = getValidEntry("soft");
  if (softEntry) {
    buyCacheStore.latestMode = "soft";
    return sliceResult(softEntry.value, limit);
  }

  const hardEntry = getValidEntry("hard");
  if (hardEntry) {
    buyCacheStore.latestMode = "hard";
    return sliceResult(hardEntry.value, limit);
  }

  return null;
}

export function setSharedBuyScanResult(result: BuyScanResult): void {
  const mode = result.summary.scanMode;
  const cachedAt = Date.now();

  buyCacheStore.entries[mode] = {
    value: result,
    cachedAt,
    expiresAt: cachedAt + BUY_CACHE_TTL_MS
  };

  buyCacheStore.latestMode = mode;
}

export function clearSharedBuyScanResult(mode?: BuyScanMode): void {
  if (mode) {
    delete buyCacheStore.entries[mode];
    delete buyCacheStore.warmupPromises[mode];

    if (buyCacheStore.latestMode === mode) {
      buyCacheStore.latestMode = null;
    }

    return;
  }

  buyCacheStore.entries = {};
  buyCacheStore.latestMode = null;
  buyCacheStore.warmupPromises = {};
}

export function getSharedBuyScanStatus(mode?: BuyScanMode) {
  const resolvedMode = mode ?? buyCacheStore.latestMode ?? null;
  const entry = resolvedMode ? getValidEntry(resolvedMode) : null;

  return {
    hasReadyCache: Boolean(entry),
    latestMode: entry ? resolvedMode : null,
    cacheAgeMs: entry ? Date.now() - entry.cachedAt : null,
    cacheExpiresInMs: entry ? Math.max(0, entry.expiresAt - Date.now()) : null,
    warmedAt: entry ? new Date(entry.cachedAt).toISOString() : null,
    warming: mode
      ? Boolean(buyCacheStore.warmupPromises[mode])
      : Boolean(buyCacheStore.warmupPromises.soft) || Boolean(buyCacheStore.warmupPromises.hard)
  };
}

export function getSharedBuyScanWarmupPromise(mode: BuyScanMode): Promise<void> | null {
  return buyCacheStore.warmupPromises[mode] ?? null;
}

export function setSharedBuyScanWarmupPromise(
  mode: BuyScanMode,
  promise: Promise<void> | null
): void {
  if (promise) {
    buyCacheStore.warmupPromises[mode] = promise;
  } else {
    delete buyCacheStore.warmupPromises[mode];
  }
}