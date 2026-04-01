import express, { Request, Response } from "express";
import { env } from "./config/env";
import { getBot } from "./bot/bot";
import { buildMarketContext, getCoinInfo, getCandles, parseMarketPair } from "./services/market.service";
import { evaluateMarketSignal } from "./services/signal.service";
import { getBuyScanResult } from "./services/buy.service";
import { SYMBOL_TO_COINCAP_ID, normalizeSymbol } from "./utils/symbols";

const app = express();

app.use(express.json());

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", env.CORS_ORIGIN);
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
  priceUsd: number;
  change24h: number | null;
  change30d: number | null;
  trend30d: "BULLISH" | "BEARISH" | "SIDEWAYS";
  rsi14: number | null;
  signal: "BUY" | "HOLD" | "SELL";
  score: number;
};

async function buildMarketListItem(symbol: string): Promise<MarketListItem> {
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
      "/api/dashboard",
      "/api/markets",
      "/api/markets/:symbol",
      "/api/markets/:symbol/candles"
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

app.get("/api/dashboard", async (_req, res) => {
  try {
    const [featured, buys] = await Promise.all([
      mapWithConcurrency(DASHBOARD_SYMBOLS, 3, buildMarketListItem),
      getBuyScanResult(5)
    ]);

    return ok(res, {
      featured,
      topBuys: buys.buys,
      summary: buys.summary
    });
  } catch (error) {
    return fail(res, error);
  }
});

app.get("/api/markets", async (req, res) => {
  try {
    const limitRaw = String(req.query.limit || "12");
    const limit = Math.max(1, Math.min(Number(limitRaw) || 12, ALL_SYMBOLS.length));
    const symbols = ALL_SYMBOLS.slice(0, limit);

    const items = await mapWithConcurrency(symbols, 3, buildMarketListItem);

    items.sort((a, b) => b.score - a.score);

    return ok(res, {
      items,
      total: items.length
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
      signal: evaluation ?? {
        signal: "HOLD",
        score: 0
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

app.get("/api/spot/:symbol", async (req: Request, res: Response) => {
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