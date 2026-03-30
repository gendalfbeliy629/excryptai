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

export type PairPrice = {
  fromSymbol: string;
  toSymbol: string;
  price: number;
  change24h: number | null;
  high24h: number | null;
  low24h: number | null;
};

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};

  if (env.CRYPTOCOMPARE_API_KEY) {
    headers.authorization = `Apikey ${env.CRYPTOCOMPARE_API_KEY}`;
  }

  return headers;
}

function normalizeQuoteSymbol(input: string): string {
  return input.trim().toUpperCase().replace(/\//g, "");
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

export async function getPairPrice(
  baseSymbolInput: string,
  quoteSymbolInput = "USDT"
): Promise<PairPrice> {
  const fromSymbol = normalizeSymbol(baseSymbolInput);
  const toSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  const response = await axios.get(
    "https://min-api.cryptocompare.com/data/pricemultifull",
    {
      params: {
        fsyms: fromSymbol,
        tsyms: toSymbol,
      },
      headers: buildHeaders(),
      timeout: 10000,
    }
  );

  const raw = response.data?.RAW?.[fromSymbol]?.[toSymbol];

  if (!raw) {
    throw new Error(
      `CryptoCompare returned empty pair price for ${fromSymbol}/${toSymbol}`
    );
  }

  return {
    fromSymbol,
    toSymbol,
    price: Number(raw.PRICE),
    change24h:
      typeof raw.CHANGEPCT24HOUR === "number" ? raw.CHANGEPCT24HOUR : null,
    high24h: typeof raw.HIGH24HOUR === "number" ? raw.HIGH24HOUR : null,
    low24h: typeof raw.LOW24HOUR === "number" ? raw.LOW24HOUR : null,
  };
}

export async function getHourlyOHLC(
  symbolInput: string,
  limit = 24,
  quoteSymbolInput = "USDT"
): Promise<Candle[]> {
  const symbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  const response = await axios.get(
    "https://min-api.cryptocompare.com/data/v2/histohour",
    {
      params: {
        fsym: symbol,
        tsym: quoteSymbol,
        limit,
      },
      headers: buildHeaders(),
      timeout: 10000,
    }
  );

  const rows = response.data?.Data?.Data;

  if (!Array.isArray(rows)) {
    throw new Error(
      `CryptoCompare returned invalid hourly OHLC for ${symbol}/${quoteSymbol}`
    );
  }

  return mapRows(rows);
}

export async function getDailyOHLC(
  symbolInput: string,
  limit = 30,
  quoteSymbolInput = "USDT"
): Promise<Candle[]> {
  const symbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  const response = await axios.get(
    "https://min-api.cryptocompare.com/data/v2/histoday",
    {
      params: {
        fsym: symbol,
        tsym: quoteSymbol,
        limit,
      },
      headers: buildHeaders(),
      timeout: 10000,
    }
  );

  const rows = response.data?.Data?.Data;

  if (!Array.isArray(rows)) {
    throw new Error(
      `CryptoCompare returned invalid daily OHLC for ${symbol}/${quoteSymbol}`
    );
  }

  return mapRows(rows);
}