import axios from "axios";
import { env } from "../config/env";
import { normalizeSymbol } from "../utils/symbols";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumeFrom: number;
  volumeTo: number;
};

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (env.CRYPTOCOMPARE_API_KEY) {
    headers.authorization = `Apikey ${env.CRYPTOCOMPARE_API_KEY}`;
  }

  return headers;
}

function mapRows(rows: any[]): Candle[] {
  return rows.map((row: any) => ({
    time: Number(row.time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volumeFrom: Number(row.volumefrom),
    volumeTo: Number(row.volumeto),
  }));
}

export async function getHourlyOHLC(
  symbolInput: string,
  limit = 24
): Promise<Candle[]> {
  const symbol = normalizeSymbol(symbolInput);

  const response = await axios.get(
    "https://min-api.cryptocompare.com/data/v2/histohour",
    {
      params: {
        fsym: symbol,
        tsym: "USD",
        limit,
      },
      headers: buildHeaders(),
      timeout: 10000,
    }
  );

  const rows = response.data?.Data?.Data;

  if (!Array.isArray(rows)) {
    throw new Error(`CryptoCompare returned invalid hourly OHLC for ${symbol}`);
  }

  return mapRows(rows);
}

export async function getDailyOHLC(
  symbolInput: string,
  limit = 30
): Promise<Candle[]> {
  const symbol = normalizeSymbol(symbolInput);

  const response = await axios.get(
    "https://min-api.cryptocompare.com/data/v2/histoday",
    {
      params: {
        fsym: symbol,
        tsym: "USD",
        limit,
      },
      headers: buildHeaders(),
      timeout: 10000,
    }
  );

  const rows = response.data?.Data?.Data;

  if (!Array.isArray(rows)) {
    throw new Error(`CryptoCompare returned invalid daily OHLC for ${symbol}`);
  }

  return mapRows(rows);
}