import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { env } from "../config/env";

type MemoryEntry = {
  value: string;
  expiresAt: number | null;
};

type AppRedisClient = ReturnType<typeof createClient>;

const memoryStore = new Map<string, MemoryEntry>();

let redisClient: AppRedisClient | null = null;
let connectPromise: Promise<AppRedisClient | null> | null = null;
let connectionLogged = false;
let startupConfigLogged = false;
let memoryFallbackLogged = false;

function getMemoryEntry(key: string): MemoryEntry | null {
  const entry = memoryStore.get(key) ?? null;
  if (!entry) {
    return null;
  }

  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }

  return entry;
}

function maskRedisUrl(redisUrl: string | undefined): string {
  if (!redisUrl) {
    return "<empty>";
  }

  try {
    const parsed = new URL(redisUrl);

    if (parsed.username) {
      parsed.username = "***";
    }

    if (parsed.password) {
      parsed.password = "***";
    }

    return parsed.toString();
  } catch {
    return "<invalid redis url>";
  }
}

function getRedisDbLabel(redisUrl: string | undefined): string {
  if (!redisUrl) {
    return "default";
  }

  try {
    const parsed = new URL(redisUrl);
    const db = parsed.pathname.replace(/^\//, "");
    return db || "default";
  } catch {
    return "unknown";
  }
}

function logRedisStartupConfig(): void {
  if (startupConfigLogged) {
    return;
  }

  startupConfigLogged = true;

  console.log("[redis] startup config", {
    enabled: env.REDIS_ENABLED,
    hasRedisUrl: Boolean(env.REDIS_URL),
    redisUrlMasked: maskRedisUrl(env.REDIS_URL),
    redisDb: getRedisDbLabel(env.REDIS_URL)
  });
}

export function isRedisEnabled(): boolean {
  return env.REDIS_ENABLED && Boolean(env.REDIS_URL);
}

export async function connectRedis(): Promise<AppRedisClient | null> {
  logRedisStartupConfig();

  if (!isRedisEnabled()) {
    if (!memoryFallbackLogged) {
      console.log("[redis] disabled or REDIS_URL is empty, using in-memory cache");
      memoryFallbackLogged = true;
    }
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (connectPromise) {
    return connectPromise;
  }

  connectPromise = (async (): Promise<AppRedisClient | null> => {
    try {
      console.log("[redis] connecting", {
        redisUrlMasked: maskRedisUrl(env.REDIS_URL),
        redisDb: getRedisDbLabel(env.REDIS_URL)
      });

      const client = createClient({
        url: env.REDIS_URL,
        socket: {
          connectTimeout: 10_000,
          reconnectStrategy: (retries: number): number | Error => {
            if (retries > 20) {
              return new Error("Redis reconnect attempts exceeded");
            }

            return Math.min(5_000, 200 + retries * 250);
          }
        }
      });

      client.on("error", (error: unknown) => {
        console.error("Redis client error:", error);
      });

      await client.connect();
      redisClient = client;

      if (!connectionLogged) {
        console.log("[redis] connected", {
          redisUrlMasked: maskRedisUrl(env.REDIS_URL),
          redisDb: getRedisDbLabel(env.REDIS_URL)
        });
        connectionLogged = true;
      }

      return client;
    } catch (error: unknown) {
      console.error("Redis connection failed, falling back to in-memory cache:", error);
      redisClient = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  const client = redisClient;
  redisClient = null;

  try {
    if (client.isOpen) {
      await client.quit();
    }
  } catch {
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  }
}

export async function getString(key: string): Promise<string | null> {
  const client = await connectRedis();

  if (client?.isOpen) {
    try {
      return await client.get(key);
    } catch (error: unknown) {
      console.error(`Redis get failed for key ${key}:`, error);
    }
  }

  return getMemoryEntry(key)?.value ?? null;
}

export async function setString(key: string, value: string, ttlMs?: number): Promise<void> {
  const client = await connectRedis();

  if (client?.isOpen) {
    try {
      if (ttlMs && ttlMs > 0) {
        await client.set(key, value, {
          PX: ttlMs
        });
      } else {
        await client.set(key, value);
      }
      return;
    } catch (error: unknown) {
      console.error(`Redis set failed for key ${key}:`, error);
    }
  }

  memoryStore.set(key, {
    value,
    expiresAt: ttlMs && ttlMs > 0 ? Date.now() + ttlMs : null
  });
}

export async function deleteKey(key: string): Promise<void> {
  const client = await connectRedis();

  if (client?.isOpen) {
    try {
      await client.del(key);
    } catch (error: unknown) {
      console.error(`Redis delete failed for key ${key}:`, error);
    }
  }

  memoryStore.delete(key);
}

export async function deleteKeys(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deleteKey(key)));
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getString(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error: unknown) {
    console.error(`Failed to parse JSON cache for key ${key}:`, error);
    await deleteKey(key);
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlMs?: number): Promise<void> {
  await setString(key, JSON.stringify(value), ttlMs);
}

export async function acquireLock(key: string, ttlMs: number): Promise<string | null> {
  const token = randomUUID();
  const client = await connectRedis();

  if (client?.isOpen) {
    try {
      const result = await client.set(key, token, {
        NX: true,
        PX: ttlMs
      });

      return result === "OK" ? token : null;
    } catch (error: unknown) {
      console.error(`Redis lock acquire failed for key ${key}:`, error);
      return null;
    }
  }

  const existing = getMemoryEntry(key);
  if (existing) {
    return null;
  }

  memoryStore.set(key, {
    value: token,
    expiresAt: Date.now() + ttlMs
  });

  return token;
}

export async function releaseLock(key: string, token: string): Promise<void> {
  const client = await connectRedis();

  if (client?.isOpen) {
    try {
      const current = await client.get(key);

      if (current === token) {
        await client.del(key);
      }

      return;
    } catch (error: unknown) {
      console.error(`Redis lock release failed for key ${key}:`, error);
    }
  }

  const existing = getMemoryEntry(key);
  if (existing?.value === token) {
    memoryStore.delete(key);
  }
}
