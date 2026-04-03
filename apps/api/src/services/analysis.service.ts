import {
  CoinInfo,
  OHLCItem,
  getCoinInfo,
  getOHLC,
  parseMarketPair,
} from "./market.service";

export type MarketAnalysis = {
  pair: string;
  symbol: string;
  quoteSymbol: string;
  coin: CoinInfo;
  candles: OHLCItem[];
  latestClose: number | null;
  high30d: number | null;
  low30d: number | null;
  change30d: number | null;
  averageClose30d: number | null;
  averageVolume30d: number | null;
  summary: string;
};

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function percentChange(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) {
    return null;
  }

  return ((to - from) / from) * 100;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export async function analyzeMarket(
  rawPair = "BTC/USDT"
): Promise<MarketAnalysis> {
  const { baseSymbol, quoteSymbol, displayPair } = parseMarketPair(rawPair);

  const [coin, candles] = await Promise.all([
    getCoinInfo(displayPair),
    getOHLC(baseSymbol, 30, quoteSymbol),
  ]);

  const closes: number[] = candles.map((c: OHLCItem) => c.close);
  const volumes: number[] = candles.map(
    (c: OHLCItem) => c.volumeTo ?? c.volumeFrom ?? 0
  );

  const latestClose = closes.length ? closes[closes.length - 1] : null;
  const high30d = candles.length
    ? Math.max(...candles.map((c: OHLCItem) => c.high))
    : null;
  const low30d = candles.length
    ? Math.min(...candles.map((c: OHLCItem) => c.low))
    : null;

  const firstClose = closes.length ? closes[0] : null;
  const change30d =
    firstClose !== null && latestClose !== null
      ? percentChange(firstClose, latestClose)
      : null;

  const averageClose30d = average(closes);
  const averageVolume30d = average(volumes);

  const summary = [
    `Пара: ${displayPair}`,
    `Цена сейчас: ${coin.priceUsd !== null ? `$${coin.priceUsd.toFixed(6)}` : "n/a"}`,
    `Изменение за 30д: ${formatPercent(change30d)}`,
    `High 30д: ${high30d !== null ? high30d.toFixed(8) : "n/a"}`,
    `Low 30д: ${low30d !== null ? low30d.toFixed(8) : "n/a"}`,
  ].join("\n");

  return {
    pair: displayPair,
    symbol: baseSymbol,
    quoteSymbol,
    coin,
    candles,
    latestClose,
    high30d,
    low30d,
    change30d,
    averageClose30d,
    averageVolume30d,
    summary,
  };
}

export async function getAnalysis(rawPair = "BTC/USDT"): Promise<MarketAnalysis> {
  return analyzeMarket(rawPair);
}