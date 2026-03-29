import axios from "axios";

export async function getCryptoPrice(symbol: string) {
  const res = await axios.get(
    `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`
  );

  return res.data.price;
}
