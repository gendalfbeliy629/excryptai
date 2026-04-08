import express, { Response } from "express";
import { env } from "./config/env";
import { getBot } from "./bot/bot";
import { forgetTelegramSubscriber, getTelegramSubscribers } from "./utils/telegram-subscribers";
import {
  buildMarketContext,
  getCoinInfo,
  parseMarketPair
} from "./services/market.service";
import { evaluateMarketSignal, BuyScanMode } from "./services/signal.service";
import { getBuyScanResult, type BuyScanResult } from "./services/buy.service";
import { getAssetInfo } from "./services/info.service";
import { askAI } from "./services/ai.service";
import { SYMBOL_TO_COINCAP_ID, normalizeSymbol } from "./utils/symbols";
import {
  getSharedBuyScanResult,
  getSharedBuyScanStatus,
  getSharedBuyScanWarmupPromise,
  setSharedBuyScanResult,
  setSharedBuyScanWarmupPromise
} from "./utils/buy-cache";
import { getAllPionexSpotTickers } from "./services/pionex.service";
import { buildBuyCommandMessage, formatCacheTime } from "./utils/buy-message";

const BUY_CACHE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

async function notifyTelegramSubscribersAboutBuys(result: BuyScanResult, mode: BuyScanMode) {
  if (!result.buys.length) {
    return;
  }

  const text = [
    `🟢 Обновлен кеш BUY-сигналов (${mode})`,
    buildBuyCommandMessage(result, mode, formatCacheTime(new Date().toISOString()))
  ].join("\n\n");

  const subscribers = getTelegramSubscribers();
  if (!subscribers.length) {
    return;
  }

  let bot;

  try {
    bot = getBot();
  } catch (error) {
    console.error("Telegram notification skipped: bot unavailable", error);
    return;
  }

  await Promise.all(
    subscribers.map(async (subscriber) => {
      try {
        await bot.telegram.sendMessage(subscriber.chatId, text, {
          link_preview_options: {
            is_disabled: true
          }
        });
      } catch (error) {
        console.error(`Failed to send cache notification to chat ${subscriber.chatId}:`, error);
        forgetTelegramSubscriber(subscriber.chatId);
      }
    })
  );
}

const app = express();

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

function parseMode(value: unknown): BuyScanMode {
  return String(value || "soft").toLowerCase() === "hard" ? "hard" : "soft";
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
  volume24h: number;
};

async function warmBuySignalsCache(options?: {
  force?: boolean;
  mode?: BuyScanMode;
  limit?: number;
}): Promise<void> {
  const force = options?.force ?? false;
  const mode = options?.mode ?? "soft";
  const limit = Math.max(10, options?.limit ?? 10);

  if (!force) {
    const cached = getSharedBuyScanResult(5, mode);
    if (cached) {
      return;
    }
  }

  const currentWarmupPromise = getSharedBuyScanWarmupPromise(mode);
  if (currentWarmupPromise) {
    return currentWarmupPromise;
  }

  const nextWarmupPromise = (async () => {
    try {
      const result = await getBuyScanResult(limit, mode);
      setSharedBuyScanResult(result);
      await notifyTelegramSubscribersAboutBuys(result, mode);
    } finally {
      setSharedBuyScanWarmupPromise(mode, null);
    }
  })();

  setSharedBuyScanWarmupPromise(mode, nextWarmupPromise);

  return nextWarmupPromise;
}

async function warmAllModes(limit = 10, force = true): Promise<void> {
  await Promise.all([
    warmBuySignalsCache({ force, mode: "soft", limit }),
    warmBuySignalsCache({ force, mode: "hard", limit })
  ]);
}

async function getDashboardBuyScanResult(
  limit = 5,
  mode: BuyScanMode = "soft"
): Promise<BuyScanResult> {
  const cached = getSharedBuyScanResult(limit, mode);
  if (cached) {
    return cached;
  }

  const isWarming = Boolean(getSharedBuyScanWarmupPromise(mode));

  throw new Error(
    isWarming
      ? `BUY cache for mode ${mode} is still warming up`
      : `BUY cache for mode ${mode} is not ready`
  );
}

async function buildMarketListItem(symbol: string, volume24h = 0): Promise<MarketListItem | null> {
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
        score: 0,
        volume24h
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
      score: evaluation.score,
      volume24h
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
      "/api/dashboard/bootstrap-status?mode=soft|hard",
      "/api/dashboard/refresh-cache?mode=soft|hard",
      "/api/dashboard?mode=soft|hard",
      "/api/markets",
      "/api/markets/:symbol",
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

app.get("/api/dashboard/bootstrap-status", async (req, res) => {
  try {
    const mode = parseMode(req.query.mode);
    const cacheStatus = getSharedBuyScanStatus(mode);

    return ok(res, {
      buySignalsCacheReady: cacheStatus.hasReadyCache,
      buySignalsCacheWarming: cacheStatus.warming,
      cacheAgeMs: cacheStatus.cacheAgeMs,
      cacheExpiresInMs: cacheStatus.cacheExpiresInMs,
      warmedAt: cacheStatus.warmedAt,
      scanMode: cacheStatus.latestMode
    });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/dashboard/refresh-cache", async (req, res) => {
  try {
    const mode = parseMode(req.query.mode);

    await warmBuySignalsCache({
      force: true,
      mode,
      limit: 10
    });

    const cacheStatus = getSharedBuyScanStatus(mode);

    return ok(res, {
      buySignalsCacheReady: cacheStatus.hasReadyCache,
      buySignalsCacheWarming: cacheStatus.warming,
      cacheAgeMs: cacheStatus.cacheAgeMs,
      cacheExpiresInMs: cacheStatus.cacheExpiresInMs,
      warmedAt: cacheStatus.warmedAt,
      scanMode: cacheStatus.latestMode,
      refreshedAt: new Date().toISOString()
    });
  } catch (error) {
    return fail(res, error, 500);
  }
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const mode = parseMode(req.query.mode);
    const tickers = await getAllPionexSpotTickers();

    const featuredRaw = await mapWithConcurrency(DASHBOARD_SYMBOLS, 3, async (symbol) => {
      const ticker = tickers.find(
        (item) => item.baseSymbol === symbol && item.quoteSymbol === "USDT"
      );
      return buildMarketListItem(symbol, ticker?.amount ?? 0);
    });

    const buys = await getDashboardBuyScanResult(5, mode);
    const cacheStatus = getSharedBuyScanStatus(mode);

    const featured = featuredRaw
      .filter((item): item is MarketListItem => item !== null)
      .sort((a, b) => b.volume24h - a.volume24h);

    return ok(res, {
      featured,
      topBuys: buys.buys,
      summary: buys.summary,
      generatedAt: cacheStatus.warmedAt,
      buyCommandText: buildBuyCommandMessage(
        buys,
        mode,
        formatCacheTime(cacheStatus.warmedAt ?? new Date().toISOString())
      ),
      scanMode: mode,
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

    const tickers = await getAllPionexSpotTickers();

    const sortedSymbols = tickers
      .filter((item) => item.quoteSymbol === "USDT")
      .sort((a, b) => b.amount - a.amount)
      .map((item) => item.baseSymbol)
      .filter(
        (symbol, index, arr) => arr.indexOf(symbol) === index && ALL_SYMBOLS.includes(symbol)
      )
      .slice(0, limit);

    const itemsRaw = await mapWithConcurrency(sortedSymbols, 3, async (symbol) => {
      const ticker = tickers.find(
        (item) => item.baseSymbol === symbol && item.quoteSymbol === "USDT"
      );
      return buildMarketListItem(symbol, ticker?.amount ?? 0);
    });

    const items = itemsRaw
      .filter((item): item is MarketListItem => item !== null)
      .sort((a, b) => b.volume24h - a.volume24h);

    return ok(res, {
      items,
      total: items.length,
      degraded: items.length < sortedSymbols.length
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
      `Дай краткую аналитику по паре ${displayPair} на 30 дней. Обязательно сохрани deterministic signal без изменений и объясни риски.`,
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

const refreshTimer = setInterval(() => {
  void warmAllModes(10, true).catch((error) => {
    console.error("Scheduled buy signal refresh failed:", error);
  });
}, BUY_CACHE_REFRESH_INTERVAL_MS);

refreshTimer.unref?.();

void warmAllModes(10, true).catch((error) => {
  console.error("Initial buy signal warmup failed:", error);
});

let launchedBot: ReturnType<typeof getBot> | null = null;

(async () => {
  if (!env.TELEGRAM_BOT_ENABLED) {
    console.log("Telegram bot launch skipped: TELEGRAM_BOT_ENABLED=false");
    return;
  }

  try {
    launchedBot = getBot();
    await launchedBot.launch();
    await launchedBot.telegram.getMe();
    console.log("Telegram bot started");
  } catch (error) {
    console.error("Telegram bot launch failed:", error);
  }
})();

const shutdown = async () => {
  try {
    if (launchedBot) {
      await launchedBot.stop();
    }
  } catch (error) {
    console.error("Bot shutdown failed:", error);
  }

  server.close(() => {
    process.exit(0);
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);