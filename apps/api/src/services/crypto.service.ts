import axios from "axios";

type PriceResult = {
  symbol: string;
  name: string;
  price: number;
};

type CachedCoin = {
  id: string;
  name: string;
  symbol: string;
};

type PriceCacheEntry = {
  data: PriceResult;
  expiresAt: number;
};

const coinIdCache = new Map<string, CachedCoin>();
const priceCache = new Map<string, PriceCacheEntry>();
const inflightPriceRequests = new Map<string, Promise<PriceResult>>();

const PRICE_TTL_MS = 60_000;

const POPULAR_COINS: Record<string, CachedCoin> = {
  BTC: { id: "bitcoin", name: "Bitcoin", symbol: "BTC" },
  ETH: { id: "ethereum", name: "Ethereum", symbol: "ETH" },
  SOL: { id: "solana", name: "Solana", symbol: "SOL" },
  XRP: { id: "ripple", name: "XRP", symbol: "XRP" },
  BNB: { id: "binancecoin", name: "BNB", symbol: "BNB" },
  ADA: { id: "cardano", name: "Cardano", symbol: "ADA" },
  DOGE: { id: "dogecoin", name: "Dogecoin", symbol: "DOGE" },
  TON: { id: "the-open-network", name: "Toncoin", symbol: "TON" },
  TRX: { id: "tron", name: "TRON", symbol: "TRX" },
  AVAX: { id: "avalanche-2", name: "Avalanche", symbol: "AVAX" },
  SHIB: { id: "shiba-inu", name: "Shiba Inu", symbol: "SHIB" },
  PEPE: { id: "pepe", name: "Pepe", symbol: "PEPE" },
  LINK: { id: "chainlink", name: "Chainlink", symbol: "LINK" },
  DOT: { id: "polkadot", name: "Polkadot", symbol: "DOT" },
  MATIC: { id: "matic-network", name: "Polygon", symbol: "MATIC" },
  LTC: { id: "litecoin", name: "Litecoin", symbol: "LTC" },
};

function normalizeSymbol(input: string): string {
  return input.trim().toUpperCase().replace(/USDT$|USD$/i, "");
}

async function searchCoin(symbol: string): Promise<CachedCoin | null> {
  const query = normalizeSymbol(symbol);

  if (POPULAR_COINS[query]) {
    return POPULAR_COINS[query];
  }

  if (coinIdCache.has(query)) {
    return coinIdCache.get(query)!;
  }

  const response = await axios.get("https://api.coingecko.com/api/v3/search", {
    params: { query },
    timeout: 10000,
  });

  const coins = response.data?.coins ?? [];
  const exact =
    coins.find((c: any) => String(c.symbol).toUpperCase() === query) ?? coins[0];

  if (!exact) {
    return null;
  }

  const found: CachedCoin = {
    id: exact.id,
    name: exact.name,
    symbol: String(exact.symbol).toUpperCase(),
  };

  coinIdCache.set(query, found);
  return found;
}

export async function getCryptoPrice(symbol: string): Promise<PriceResult> {
  const normalized = normalizeSymbol(symbol);

  const cached = priceCache.get(normalized);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const inflight = inflightPriceRequests.get(normalized);
  if (inflight) {
    return inflight;
  }

  const requestPromise = (async () => {
    const coin = await searchCoin(normalized);

    if (!coin) {
      throw new Error(`Coin not found: ${symbol}`);
    }

    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      {
        params: {
          ids: coin.id,
          vs_currencies: "usd",
        },
        timeout: 10000,
      }
    );

    const price = response.data?.[coin.id]?.usd;

    if (typeof price !== "number") {
      throw new Error(`Price not found for ${symbol}`);
    }

    const result: PriceResult = {
      symbol: coin.symbol,
      name: coin.name,
      price,
    };

    priceCache.set(normalized, {
      data: result,
      expiresAt: Date.now() + PRICE_TTL_MS,
    });

    return result;
  })();

  inflightPriceRequests.set(normalized, requestPromise);

  try {
    return await requestPromise;
  } finally {
    inflightPriceRequests.delete(normalized);
  }
}