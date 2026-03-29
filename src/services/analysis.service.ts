import { getCoinInfo } from "./market.service";
import { getOHLC } from "./market.service";

export async function buildMarketContext(symbol: string) {
  const coin = await getCoinInfo(symbol.toLowerCase());
  const candles = await getOHLC(symbol);
  const last = candles.slice(-10);
  return `
COIN DATA:
Name: ${coin.name}
Price: ${coin.price}
Market Cap: ${coin.marketCap}
24h Change: ${coin.change24h}%
Volume: ${coin.volume}

LAST 10 CANDLES:
${last.map((c: any) =>
  `O:${c.open} H:${c.high} L:${c.low} C:${c.close}`
).join("\n")}
`;
}
