import axios from "axios";

const CG = "https://api.coingecko.com/api/v3";
const BINANCE = "https://api.binance.com";

export async function getCoinInfo(coin: string) {
  const res = await axios.get(`${CG}/coins/${coin}`);
  return {
    name: res.data.name,
    symbol: res.data.symbol,
    marketCap: res.data.market_data.market_cap.usd,
    price: res.data.market_data.current_price.usd,
    change24h: res.data.market_data.price_change_percentage_24h,
    volume: res.data.market_data.total_volume.usd,
  };
}

export async function getTicker(symbol: string) {
  const res = await axios.get(
    `${BINANCE}/api/v3/ticker/price?symbol=${symbol}USDT`
  );
  return res.data.price;
}

export async function getOHLC(symbol: string, interval = "1h") {
  const res = await axios.get(
    `${BINANCE}/api/v3/klines`,
    {
      params: {
        symbol: `${symbol}USDT`,
        interval,
        limit: 50,
      },
    }
  );
  return res.data.map((c: any[]) => ({
    time: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
  }));
}
