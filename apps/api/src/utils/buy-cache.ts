import type { BuyScanMode } from "../services/signal.service";
import type { BuyScanResult } from "../services/buy.service";
import { deleteKeys, getJson, setJson } from "../lib/redis";

export const BUY_CACHE_TTL_MS = 70 * 60 * 1000;
const BUY_CACHE_STALE_WINDOW_MS = 70 * 60 * 1000;

type BuyCacheEntry = {
  mode: BuyScanMode;
  value: BuyScanResult;
  cachedAt: number;
  expiresAt: number;
  staleExpiresAt: number;
};

type BuyCacheMeta = {
  latestMode: BuyScanMode | null;
  updatedAt: number | null;
};

type BuyCacheStatusRecord = {
  mode: BuyScanMode;
  hasReadyCache: boolean;
  latestMode: BuyScanMode | null;
  cacheAgeMs: number | null;
  cacheExpiresInMs: number | null;
  warmedAt: string | null;
  warming: boolean;
  isStale: boolean;
  updatedAt: string;
};

const warmupPromises: Partial<Record<BuyScanMode, Promise<void> | null>> = {};

function getBuyCacheKey(mode: BuyScanMode): string {
  return `buy-cache:${mode}`;
}

function getBuyCacheStatusKey(mode: BuyScanMode): string {
  return `buy-cache-status:${mode}`;
}

function getValidEntry(
  entry: BuyCacheEntry | null,
  allowStale = true
): BuyCacheEntry | null {
  if (!entry) {
    return null;
  }

  if (Date.now() > entry.staleExpiresAt) {
    return null;
  }

  if (!allowStale && Date.now() > entry.expiresAt) {
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

export async function setSharedBuyScanStatus(
  mode: BuyScanMode,
  patch: Partial<BuyCacheStatusRecord>
): Promise<void> {
  const current =
    (await getJson<BuyCacheStatusRecord>(getBuyCacheStatusKey(mode))) ?? {
      mode,
      hasReadyCache: false,
      latestMode: null,
      cacheAgeMs: null,
      cacheExpiresInMs: null,
      warmedAt: null,
      warming: false,
      isStale: false,
      updatedAt: new Date().toISOString()
    };

  const next: BuyCacheStatusRecord = {
    ...current,
    ...patch,
    mode,
    updatedAt: new Date().toISOString()
  };

  await setJson(getBuyCacheStatusKey(mode), next, BUY_CACHE_TTL_MS + BUY_CACHE_STALE_WINDOW_MS);
}

export async function getSharedBuyScanResult(
  limit = 5,
  preferredMode?: BuyScanMode,
  options?: { allowStale?: boolean }
): Promise<BuyScanResult | null> {
  const allowStale = options?.allowStale ?? true;

  const resolveMode = async (): Promise<BuyScanMode | null> => {
    if (preferredMode) return preferredMode;

    const meta = await getJson<BuyCacheMeta>("buy-cache:meta");
    if (meta?.latestMode) {
      return meta.latestMode;
    }

    const soft = getValidEntry(await getJson<BuyCacheEntry>(getBuyCacheKey("soft")), allowStale);
    if (soft) return "soft";

    const hard = getValidEntry(await getJson<BuyCacheEntry>(getBuyCacheKey("hard")), allowStale);
    if (hard) return "hard";

    return null;
  };

  const mode = await resolveMode();
  if (!mode) {
    return null;
  }

  const entry = getValidEntry(await getJson<BuyCacheEntry>(getBuyCacheKey(mode)), allowStale);
  if (!entry) {
    return null;
  }

  return sliceResult(entry.value, limit);
}

export async function setSharedBuyScanResult(result: BuyScanResult): Promise<void> {
  const mode = result.summary.scanMode;
  const cachedAt = Date.now();
  const entry: BuyCacheEntry = {
    mode,
    value: result,
    cachedAt,
    expiresAt: cachedAt + BUY_CACHE_TTL_MS,
    staleExpiresAt: cachedAt + BUY_CACHE_TTL_MS + BUY_CACHE_STALE_WINDOW_MS
  };

  await Promise.all([
    setJson(getBuyCacheKey(mode), entry, BUY_CACHE_TTL_MS + BUY_CACHE_STALE_WINDOW_MS),
    setJson(
      "buy-cache:meta",
      {
        latestMode: mode,
        updatedAt: cachedAt
      } satisfies BuyCacheMeta,
      BUY_CACHE_TTL_MS + BUY_CACHE_STALE_WINDOW_MS
    ),
    setSharedBuyScanStatus(mode, {
      hasReadyCache: true,
      latestMode: mode,
      cacheAgeMs: 0,
      cacheExpiresInMs: BUY_CACHE_TTL_MS,
      warmedAt: new Date(cachedAt).toISOString(),
      warming: false,
      isStale: false
    })
  ]);
}

export async function clearSharedBuyScanResult(mode?: BuyScanMode): Promise<void> {
  if (mode) {
    delete warmupPromises[mode];
    await deleteKeys([getBuyCacheKey(mode), getBuyCacheStatusKey(mode)]);
    return;
  }

  warmupPromises.soft = null;
  warmupPromises.hard = null;
  await deleteKeys([
    getBuyCacheKey("soft"),
    getBuyCacheKey("hard"),
    getBuyCacheStatusKey("soft"),
    getBuyCacheStatusKey("hard"),
    "buy-cache:meta"
  ]);
}

export async function getSharedBuyScanStatus(mode?: BuyScanMode) {
  const meta = await getJson<BuyCacheMeta>("buy-cache:meta");
  const resolvedMode = mode ?? meta?.latestMode ?? "soft";
  const entry = getValidEntry(await getJson<BuyCacheEntry>(getBuyCacheKey(resolvedMode)), true);
  const status = await getJson<BuyCacheStatusRecord>(getBuyCacheStatusKey(resolvedMode));
  const now = Date.now();

  return {
    hasReadyCache: Boolean(entry),
    latestMode: entry ? resolvedMode : meta?.latestMode ?? null,
    cacheAgeMs: entry ? now - entry.cachedAt : status?.cacheAgeMs ?? null,
    cacheExpiresInMs: entry ? Math.max(0, entry.expiresAt - now) : status?.cacheExpiresInMs ?? null,
    warmedAt: entry ? new Date(entry.cachedAt).toISOString() : status?.warmedAt ?? null,
    warming: mode
      ? Boolean(warmupPromises[mode]) || Boolean(status?.warming)
      : Boolean(warmupPromises.soft) || Boolean(warmupPromises.hard),
    isStale: entry ? now > entry.expiresAt : Boolean(status?.isStale)
  };
}

export function getSharedBuyScanWarmupPromise(mode: BuyScanMode): Promise<void> | null {
  return warmupPromises[mode] ?? null;
}

export function setSharedBuyScanWarmupPromise(
  mode: BuyScanMode,
  promise: Promise<void> | null
): void {
  if (promise) {
    warmupPromises[mode] = promise;
  } else {
    delete warmupPromises[mode];
  }
}
