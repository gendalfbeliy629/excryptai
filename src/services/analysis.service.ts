import { getCoinInfo, getOHLC } from "./market.service";

type AnalysisResult = {
  symbol: string;
  currentPrice: number | null;
  change24h: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS";
  signal: "BUY" | "SELL" | "HOLD";
  summary: string;
  candlesCount: number;
};

function calculateSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(values.length - period);
  const sum = slice.reduce((acc, val) => acc + val, 0);
  return sum / period;
}

function getTrend(
  closePrices: number[]
): "BULLISH" | "BEARISH" | "SIDEWAYS" {
  const sma7 = calculateSMA(closePrices, 7);
  const sma25 = calculateSMA(closePrices, 25);

  if (sma7 === null || sma25 === null) return "SIDEWAYS";

  if (sma7 > sma25) return "BULLISH";
  if (sma7 < sma25) return "BEARISH";
  return "SIDEWAYS";
}

function getSignal(
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS",
  change24h: number | null
): "BUY" | "SELL" | "HOLD" {
  if (trend === "BULLISH" && (change24h ?? 0) >= 0) return "BUY";
  if (trend === "BEARISH" && (change24h ?? 0) < 0) return "SELL";
  return "HOLD";
}

function buildSummary(params: {
  symbol: string;
  currentPrice: number | null;
  change24h: number | null;
  trend: "BULLISH" | "BEARISH" | "SIDEWAYS";
  signal: "BUY" | "SELL" | "HOLD";
}): string {
  const { symbol, currentPrice, change24h, trend, signal } = params;

  const priceText =
    currentPrice !== null ? `$${currentPrice.toFixed(4)}` : "нет данных";
  const changeText =
    change24h !== null ? `${change24h.toFixed(2)}%` : "нет данных";

  return [
    `Монета: ${symbol}`,
    `Текущая цена: ${priceText}`,
    `Изменение за 24ч: ${changeText}`,
    `Краткосрочный тренд: ${trend}`,
    `Сигнал: ${signal}`,
  ].join("\n");
}

export async function analyzeCoin(symbol: string): Promise<AnalysisResult> {
  const coin = await getCoinInfo(symbol);
  const candles = await getOHLC(symbol, 30);

  const closePrices = candles
    .map((c) => c.close)
    .filter((v) => Number.isFinite(v) && v > 0);

  const trend = getTrend(closePrices);
  const signal = getSignal(trend, coin.change24h);

  return {
    symbol: coin.symbol,
    currentPrice: coin.priceUsd,
    change24h: coin.change24h,
    marketCapUsd: coin.marketCapUsd,
    volume24hUsd: coin.volume24hUsd,
    trend,
    signal,
    summary: buildSummary({
      symbol: coin.symbol,
      currentPrice: coin.priceUsd,
      change24h: coin.change24h,
      trend,
      signal,
    }),
    candlesCount: candles.length,
  };
}