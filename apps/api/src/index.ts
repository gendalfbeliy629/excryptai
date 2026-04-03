import express, { Response } from "express";
import { env } from "./config/env";
import { getBot } from "./bot/bot";
import {
  buildMarketContext,
  getCoinInfo,
  getCandles,
  parseMarketPair
} from "./services/market.service";
import { evaluateMarketSignal } from "./services/signal.service";
import { getBuyScanResult, type BuyScanResult } from "./services/buy.service";
import { getAssetInfo } from "./services/info.service";
import { askAI } from "./services/ai.service";
import { SYMBOL_TO_COINCAP_ID, normalizeSymbol } from "./utils/symbols";

const app = express();
const BUY_CACHE_TTL_MS = 3 * 60 * 1000;

app.use(express.json());

app.use((req, res, next) => {
  const allowedOrigin = env.CORS_ORIGIN || "*";

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

function ok(res: Response, data: unknown, status = 200) {
  return res.status(status).json({
    success: true,
    data
  });
}

function fail(res: Response, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return res.status(status).json({
    success: false,
    error: message
  });
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  worker: (item: TInput) => Promise<TOutput>
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  let currentIndex = 0;

  async function run(): Promise<void> {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );

  return results;
}

type MarketListItem = {
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
};

type BuyCacheEntry = {
  value: BuyScanResult;
  cachedAt: number;
  expiresAt: number;
};

let buyScanCache: BuyCacheEntry | null = null;
let buyScanWarmupPromise: Promise<void> | null = null;

function getCachedBuyScanResult(limit = 5): BuyScanResult | null {
  if (!buyScanCache) {
    return null;
  }

  if (Date.now() > buyScanCache.expiresAt) {
    buyScanCache = null;
    return null;
  }

  return {
    ...buyScanCache.value,
    buys: buyScanCache.value.buys.slice(0, limit)
  };
}

function setBuyScanCache(result: BuyScanResult) {
  buyScanCache = {
    value: result,
    cachedAt: Date.now(),
    expiresAt: Date.now() + BUY_CACHE_TTL_MS
  };
}

async function warmBuySignalsCache(): Promise<void> {
  const cached = getCachedBuyScanResult(5);
  if (cached) {
    return;
  }

  if (buyScanWarmupPromise) {
    return buyScanWarmupPromise;
  }

  buyScanWarmupPromise = (async () => {
    try {
      const result = await getBuyScanResult(10);
      setBuyScanCache(result);
    } finally {
      buyScanWarmupPromise = null;
    }
  })();

  return buyScanWarmupPromise;
}

async function getDashboardBuyScanResult(limit = 5): Promise<BuyScanResult> {
  const cached = getCachedBuyScanResult(limit);
  if (cached) {
    return cached;
  }

  const result = await getBuyScanResult(Math.max(limit, 10));
  setBuyScanCache(result);

  return {
    ...result,
    buys: result.buys.slice(0, limit)
  };
}

async function buildMarketListItem(symbol: string): Promise<MarketListItem | null> {
  try {
    const market = await buildMarketContext(symbol, "USDT");
    const evaluation = evaluateMarketSignal(market);

    if (!evaluation) {
      return {
        symbol: market.asset.symbol,
        name: market.asset.name,
        pair: market.pair.display,
        priceUsd: market.spot.priceUsd,
        change24h: market.spot.change24h,
        change30d: market.technicals.change30d,
        trend30d: market.technicals.trend30d,
        rsi14: market.technicals.rsi14,
        signal: "HOLD",
        score: 0
      };
    }

    return {
      symbol: market.asset.symbol,
      name: market.asset.name,
      pair: market.pair.display,
      priceUsd: market.spot.priceUsd,
      change24h: market.spot.change24h,
      change30d: market.technicals.change30d,
      trend30d: market.technicals.trend30d,
      rsi14: market.technicals.rsi14,
      signal: evaluation.signal,
      score: evaluation.score
    };
  } catch (error) {
    console.error(`Failed to build market list item for ${symbol}:`, error);
    return null;
  }
}

const ALL_SYMBOLS = Object.keys(SYMBOL_TO_COINCAP_ID);
const DASHBOARD_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA"];

app.get("/", (_req, res) => {
  return ok(res, {
    service: "crypto-ai-api",
    status: "ok",
    endpoints: [
      "/health",
      "/api/health",
      "/api/dashboard/bootstrap-status",
      "/api/dashboard",
      "/api/markets",
      "/api/markets/:symbol",
      "/api/markets/:symbol/candles",
      "/api/info/:symbol",
      "/api/ai/:symbol"
    ]
  });
});

app.get("/health", (_req, res) => {
  return ok(res, {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (_req, res) => {
  return ok(res, {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get("/api/symbols", (_req, res) => {
  return ok(res, ALL_SYMBOLS);
});

app.get("/api/dashboard/bootstrap-status", async (_req, res) => {
  try {
    const cached = getCachedBuyScanResult(5);

    if (!cached && !buyScanWarmupPromise) {
      void warmBuySignalsCache().catch((error) => {
        console.error("Buy signal warmup failed:", error);
      });
    }

    return ok(res, {
      buySignalsCacheReady: Boolean(cached),
      buySignalsCacheWarming: Boolean(buyScanWarmupPromise),
      cacheAgeMs: buyScanCache ? Date.now() - buyScanCache.cachedAt : null,
      warmedAt: buyScanCache ? new Date(buyScanCache.cachedAt).toISOString() : null
    });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/dashboard", async (_req, res) => {
  try {
    const [featuredRaw, buys] = await Promise.all([
      mapWithConcurrency(DASHBOARD_SYMBOLS, 3, buildMarketListItem),
      getDashboardBuyScanResult(5)
    ]);

    const featured = featuredRaw.filter(
      (item): item is MarketListItem => item !== null
    );

    return ok(res, {
      featured,
      topBuys: buys.buys,
      summary: buys.summary,
      degraded: featured.length < DASHBOARD_SYMBOLS.length
    });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/markets", async (req, res) => {
  try {
    const limitRaw = String(req.query.limit || "30");
    const limit = Math.max(1, Math.min(Number(limitRaw) || 30, ALL_SYMBOLS.length));
    const symbols = ALL_SYMBOLS.slice(0, limit);

    const itemsRaw = await mapWithConcurrency(symbols, 3, buildMarketListItem);
    const items = itemsRaw.filter((item): item is MarketListItem => item !== null);

    items.sort((a, b) => b.score - a.score);

    return ok(res, {
      items,
      total: items.length,
      degraded: items.length < symbols.length
    });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/markets/:symbol", async (req, res) => {
  try {
    const rawSymbol = String(req.params.symbol || "");
    const { baseSymbol, quoteSymbol } = parseMarketPair(rawSymbol);
    const market = await buildMarketContext(baseSymbol, quoteSymbol);
    const evaluation = evaluateMarketSignal(market);

    return ok(res, {
      market,
      signal:
        evaluation ?? {
          pair: market.pair.display,
          symbol: market.asset.symbol,
          quoteSymbol: market.pair.quoteSymbol,
          name: market.asset.name,
          price: market.spot.price,
          priceUsd: market.spot.priceUsd,
          change24h: market.spot.change24h,
          change30d: market.technicals.change30d,
          trend30d: market.technicals.trend30d,
          rsi14: market.technicals.rsi14,
          high30d: market.technicals.high30d,
          low30d: market.technicals.low30d,
          sma7: market.technicals.sma7,
          sma30: market.technicals.sma30,
          rangePosition: null,
          pullbackFromHigh: null,
          score: 0,
          signal: "HOLD" as const,
          reason: "Недостаточно данных для полного deterministic signal.",
          positives: [],
          negatives: [],
          regimeScore: 0,
          setupScore: 0,
          spaceScore: 0,
          executionScore: 0,
          riskScore: 0,
          confirmationScore: 0,
          atr1h: null,
          atr1hPercent: null,
          nearestResistance: market.technicals.structure.nearestResistance,
          nextResistance: market.technicals.structure.nextResistance,
          nearestSupport: market.technicals.structure.nearestSupport,
          secondarySupport: market.technicals.structure.secondarySupport,
          roomToResistancePercent: market.technicals.structure.roomToResistancePercent,
          entryZoneLow: null,
          entryZoneHigh: null,
          breakEvenActivationPrice: null,
          trailingAtrMultiplier: 1.25,
          protectiveStop: null,
          invalidationLevel: null,
          pullbackBuyZoneDistancePercent: null,
          stopDistancePercent: null,
          target1DistancePercent: null,
          minimumRoomPercent: null,
          entryConfirmationStatus: "NO_DATA" as const,
          entryConfirmationStrategy: "NONE" as const,
          entryConfirmationText: "Нет достаточных данных для 1H подтверждения входа.",
          confirmationLevel: null,
          confirmationRetestLevel: null,
          confirmationBreakoutLevel: null,
          lastClosed1hCandleTime: null,
          lastClosed1hCandleClose: null
        }
    });
  } catch (error) {
    return fail(res, error, 400);
  }
});

app.get("/api/markets/:symbol/candles", async (req, res) => {
  try {
    const symbol = normalizeSymbol(String(req.params.symbol || ""));
    const limit = Math.max(7, Math.min(Number(req.query.limit || 30) || 30, 90));
    const candles = await getCandles(symbol, limit, "USDT");

    return ok(res, {
      symbol,
      candles
    });
  } catch (error) {
    return fail(res, error, 400);
  }
});

app.get("/api/info/:symbol", async (req, res) => {
  try {
    const rawSymbol = String(req.params.symbol || "BTC");
    const { displayPair } = parseMarketPair(rawSymbol);
    const text = await getAssetInfo(displayPair);

    return ok(res, {
      symbol: displayPair.split("/")[0],
      pair: displayPair,
      text
    });
  } catch (error) {
    return fail(res, error, 400);
  }
});

app.get("/api/ai/:symbol", async (req, res) => {
  try {
    const rawSymbol = String(req.params.symbol || "BTC");
    const { baseSymbol, quoteSymbol, displayPair } = parseMarketPair(rawSymbol);
    const market = await buildMarketContext(baseSymbol, quoteSymbol);
    const text = await askAI(
      `Дай аналитику по паре ${displayPair} на 30 дней. Обязательно сохрани deterministic signal без изменений и объясни риски.`,
      market
    );

    return ok(res, {
      symbol: baseSymbol,
      pair: displayPair,
      text
    });
  } catch (error) {
    return fail(res, error, 400);
  }
});

app.get("/api/spot/:symbol", async (req, res) => {
  try {
    const symbol = normalizeSymbol(String(req.params.symbol || ""));
    const spot = await getCoinInfo(symbol);
    return ok(res, spot);
  } catch (error) {
    return fail(res, error, 400);
  }
});

const server = app.listen(env.PORT, env.HOST, () => {
  console.log(`API server running on http://${env.HOST}:${env.PORT}`);
});

let launchedBot: ReturnType<typeof getBot> | null = null;

(async () => {
  if (!env.TELEGRAM_BOT_ENABLED) {
    console.log("Telegram bot launch skipped: TELEGRAM_BOT_ENABLED=false");
    return;
  }

  try {
    launchedBot = getBot();

    const me = await launchedBot.telegram.getMe();
    console.log(`Bot authorized: @${me.username}`);

    await launchedBot.launch();
    console.log("Telegram bot started");
  } catch (error) {
    console.error("Bot error:", error);
  }
})();

process.once("SIGINT", () => {
  launchedBot?.stop("SIGINT");
  server.close();
});

process.once("SIGTERM", () => {
  launchedBot?.stop("SIGTERM");
  server.close();
});