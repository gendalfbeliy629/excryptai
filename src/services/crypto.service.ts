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

const coinIdCache = new Map<string, CachedCoin>();

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
  BCH: { id: "bitcoin-cash", name: "Bitcoin Cash", symbol: "BCH" },
  UNI: { id: "uniswap", name: "Uniswap", symbol: "UNI" },
  APT: { id: "aptos", name: "Aptos", symbol: "APT" },
  ARB: { id: "arbitrum", name: "Arbitrum", symbol: "ARB" },
  OP: { id: "optimism", name: "Optimism", symbol: "OP" },
  SUI: { id: "sui", name: "Sui", symbol: "SUI" },
  ATOM: { id: "cosmos", name: "Cosmos", symbol: "ATOM" },
  ETC: { id: "ethereum-classic", name: "Ethereum Classic", symbol: "ETC" },
  XLM: { id: "stellar", name: "Stellar", symbol: "XLM" },
  HBAR: { id: "hedera-hashgraph", name: "Hedera", symbol: "HBAR" },
  NEAR: { id: "near", name: "NEAR", symbol: "NEAR" },
  ICP: { id: "internet-computer", name: "Internet Computer", symbol: "ICP" },
  FIL: { id: "filecoin", name: "Filecoin", symbol: "FIL" },
  INJ: { id: "injective-protocol", name: "Injective", symbol: "INJ" },
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
  const coin = await searchCoin(symbol);

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

  return {
    symbol: coin.symbol,
    name: coin.name,
    price,
  };
}