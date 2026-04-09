import type { BuyScanMode } from "../services/signal.service";
import { deleteKeys, getJson, setJson } from "../lib/redis";

export const DASHBOARD_CACHE_TTL_MS = 10 * 60 * 1000;
const DASHBOARD_CACHE_STALE_WINDOW_MS = 20 * 60 * 1000;

type DashboardCacheEntry<T> = {
  mode: BuyScanMode;
  value: T;
  generatedAt: string | null;
  cachedAt: number;
  expiresAt: number;
  staleExpiresAt: number;
};

type DashboardCacheStatusRecord = {
  mode: BuyScanMode;
  hasReadyCache: boolean;
  cacheAgeMs: number | null;
  cacheExpiresInMs: number | null;
  warmedAt: string | null;
  warming: boolean;
  isStale: boolean;
  updatedAt: string;
};

const warmupPromises: Partial<Record<BuyScanMode, Promise<void> | null>> = {};

function getDashboardCacheKey(mode: BuyScanMode): string {
  return `dashboard-cache:${mode}`;
}

function getDashboardCacheStatusKey(mode: BuyScanMode): string {
  return `dashboard-cache-status:${mode}`;
}

function getValidEntry<T>(entry: DashboardCacheEntry<T> | null, allowStale = true) {
  if (!entry) return null;
  if (Date.now() > entry.staleExpiresAt) return null;
  if (!allowStale && Date.now() > entry.expiresAt) return null;
  return entry;
}

export async function setSharedDashboardStatus(
  mode: BuyScanMode,
  patch: Partial<DashboardCacheStatusRecord>
): Promise<void> {
  const current =
    (await getJson<DashboardCacheStatusRecord>(getDashboardCacheStatusKey(mode))) ?? {
      mode,
      hasReadyCache: false,
      cacheAgeMs: null,
      cacheExpiresInMs: null,
      warmedAt: null,
      warming: false,
      isStale: false,
      updatedAt: new Date().toISOString()
    };

  const next: DashboardCacheStatusRecord = {
    ...current,
    ...patch,
    mode,
    updatedAt: new Date().toISOString()
  };

  await setJson(
    getDashboardCacheStatusKey(mode),
    next,
    DASHBOARD_CACHE_TTL_MS + DASHBOARD_CACHE_STALE_WINDOW_MS
  );
}

export async function getSharedDashboardResult<T>(
  mode: BuyScanMode,
  options?: { allowStale?: boolean }
): Promise<T | null> {
  const entry = getValidEntry(
    await getJson<DashboardCacheEntry<T>>(getDashboardCacheKey(mode)),
    options?.allowStale ?? true
  );

  return entry?.value ?? null;
}

export async function setSharedDashboardResult<T>(
  mode: BuyScanMode,
  value: T,
  generatedAt: string | null
): Promise<void> {
  const cachedAt = Date.now();
  const entry: DashboardCacheEntry<T> = {
    mode,
    value,
    generatedAt,
    cachedAt,
    expiresAt: cachedAt + DASHBOARD_CACHE_TTL_MS,
    staleExpiresAt: cachedAt + DASHBOARD_CACHE_TTL_MS + DASHBOARD_CACHE_STALE_WINDOW_MS
  };

  await Promise.all([
    setJson(
      getDashboardCacheKey(mode),
      entry,
      DASHBOARD_CACHE_TTL_MS + DASHBOARD_CACHE_STALE_WINDOW_MS
    ),
    setSharedDashboardStatus(mode, {
      hasReadyCache: true,
      cacheAgeMs: 0,
      cacheExpiresInMs: DASHBOARD_CACHE_TTL_MS,
      warmedAt: generatedAt,
      warming: false,
      isStale: false
    })
  ]);
}

export async function getSharedDashboardStatus(mode: BuyScanMode) {
  const entry = getValidEntry(await getJson<DashboardCacheEntry<unknown>>(getDashboardCacheKey(mode)), true);
  const status = await getJson<DashboardCacheStatusRecord>(getDashboardCacheStatusKey(mode));
  const now = Date.now();

  return {
    hasReadyCache: Boolean(entry),
    cacheAgeMs: entry ? now - entry.cachedAt : status?.cacheAgeMs ?? null,
    cacheExpiresInMs: entry ? Math.max(0, entry.expiresAt - now) : status?.cacheExpiresInMs ?? null,
    warmedAt: entry?.generatedAt ?? status?.warmedAt ?? null,
    warming: Boolean(warmupPromises[mode]) || Boolean(status?.warming),
    isStale: entry ? now > entry.expiresAt : Boolean(status?.isStale)
  };
}

export async function clearSharedDashboardResult(mode?: BuyScanMode): Promise<void> {
  if (mode) {
    delete warmupPromises[mode];
    await deleteKeys([getDashboardCacheKey(mode), getDashboardCacheStatusKey(mode)]);
    return;
  }

  warmupPromises.soft = null;
  warmupPromises.hard = null;
  await deleteKeys([
    getDashboardCacheKey("soft"),
    getDashboardCacheKey("hard"),
    getDashboardCacheStatusKey("soft"),
    getDashboardCacheStatusKey("hard")
  ]);
}

export function getSharedDashboardWarmupPromise(mode: BuyScanMode): Promise<void> | null {
  return warmupPromises[mode] ?? null;
}

export function setSharedDashboardWarmupPromise(
  mode: BuyScanMode,
  promise: Promise<void> | null
): void {
  if (promise) {
    warmupPromises[mode] = promise;
  } else {
    delete warmupPromises[mode];
  }
}
