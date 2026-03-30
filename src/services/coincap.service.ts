import axios from "axios";
import { env } from "../config/env";
import { TTLCache } from "../utils/cache";
import { normalizeSymbol, SYMBOL_TO_COINCAP_ID } from "../utils/symbols";

export type SpotPrice = {
  id: string;
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd: number | null;
  changePercent24Hr: number | null;
};

const cache = new TTLCache<SpotPrice>();
const TTL_MS = 60_000;

export async function getSpotPrice(symbolInput: string): Promise<SpotPrice> {
  const symbol = normalizeSymbol(symbolInput);
  const assetId = SYMBOL_TO_COINCAP_ID[symbol];

  if (!assetId) {
    throw new Error(`Unsupported symbol for CoinCap: ${symbol}`);
  }

  const cached = cache.get(assetId);
  if (cached) return cached;

  const headers: Record<string, string> = {};
  if (env.COINCAP_API_KEY) {
    headers.Authorization = `Bearer ${env.COINCAP_API_KEY}`;
  }

  const response = await axios.get(`https://rest.coincap.io/v3/assets/${assetId}`, {
    headers,
    timeout: 10000,
  });

  const raw = response.data?.data;
  if (!raw) {
    throw new Error(`CoinCap returned empty data for ${symbol}`);
  }

  const result: SpotPrice = {
    id: raw.id,
    symbol: raw.symbol,
    name: raw.name,
    priceUsd: Number(raw.priceUsd),
    marketCapUsd: raw.marketCapUsd ? Number(raw.marketCapUsd) : null,
    changePercent24Hr: raw.changePercent24Hr ? Number(raw.changePercent24Hr) : null,
  };

  cache.set(assetId, result, TTL_MS);
  return result;
}