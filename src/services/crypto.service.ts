import axios from "axios";

type Coin = {
  id: string;
  symbol: string;
  name: string;
};

let coinsCache: Coin[] = [];
let lastUpdate = 0;

const CACHE_TTL = 1000 * 60 * 60; // 1 час

// 🔥 загрузка всех монет
async function loadCoins(): Promise<Coin[]> {
  const now = Date.now();

  if (coinsCache.length && now - lastUpdate < CACHE_TTL) {
    return coinsCache;
  }

  console.log("Loading coins list from CoinGecko...");

  const res = await axios.get(
    "https://api.coingecko.com/api/v3/coins/list",
    { timeout: 15000 }
  );

  coinsCache = res.data;
  lastUpdate = now;

  console.log(`Loaded ${coinsCache.length} coins`);

  return coinsCache;
}

// 🔍 поиск монеты
function findCoin(symbol: string, coins: Coin[]): Coin | undefined {
  const clean = symbol.toLowerCase().replace("usdt", "");

  // точное совпадение
  let coin = coins.find((c) => c.symbol === clean);

  if (coin) return coin;

  // fallback — частичное совпадение
  return coins.find((c) => c.symbol.includes(clean));
}

// 💰 получение цены
export async function getCryptoPrice(symbol: string) {
  const coins = await loadCoins();

  const coin = findCoin(symbol, coins);

  if (!coin) {
    throw new Error(`Coin not found: ${symbol}`);
  }

  const res = await axios.get(
    "https://api.coingecko.com/api/v3/simple/price",
    {
      params: {
        ids: coin.id,
        vs_currencies: "usd",
      },
      timeout: 10000,
    }
  );

  const price = res.data?.[coin.id]?.usd;

  if (!price) {
    throw new Error(`Price not found for ${symbol}`);
  }

  return {
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    price,
  };
}