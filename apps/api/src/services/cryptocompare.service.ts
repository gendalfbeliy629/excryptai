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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapRows(rows: unknown[]): Candle[] {
  return rows
    .map((row: any) => {
      const time = normalizeNumber(row?.time);
      const open = normalizeNumber(row?.open);
      const high = normalizeNumber(row?.high);
      const low = normalizeNumber(row?.low);
      const close = normalizeNumber(row?.close);
      const volumeFrom = normalizeNumber(row?.volumefrom) ?? 0;
      const volumeTo = normalizeNumber(row?.volumeto) ?? 0;

      if (
        time === null ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      if (high < low) {
        return null;
      }

      if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
        return null;
      }

      return {
        time,
        open,
        high,
        low,
        close,
        volumeFrom,
        volumeTo
      };
    })
    .filter((item): item is Candle => item !== null)
    .sort((a, b) => a.time - b.time);
}

function warnInvalidOhlc(type: "hourly" | "daily", symbol: string, quoteSymbol: string) {
  console.warn(
    `CryptoCompare returned invalid ${type} OHLC for ${symbol}/${quoteSymbol}. Fallback to empty candles.`
  );
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
        tsyms: toSymbol
      },
      headers: buildHeaders(),
      timeout: 10000
    }
  );

  const raw = response.data?.RAW?.[fromSymbol]?.[toSymbol];

  if (!raw) {
    throw new Error(
      `CryptoCompare returned empty pair price for ${fromSymbol}/${toSymbol}`
    );
  }

  const price = normalizeNumber(raw.PRICE);

  if (price === null || price <= 0) {
    throw new Error(
      `CryptoCompare returned invalid pair price for ${fromSymbol}/${toSymbol}`
    );
  }

  return {
    fromSymbol,
    toSymbol,
    price,
    change24h: isFiniteNumber(raw.CHANGEPCT24HOUR) ? raw.CHANGEPCT24HOUR : null,
    high24h: isFiniteNumber(raw.HIGH24HOUR) ? raw.HIGH24HOUR : null,
    low24h: isFiniteNumber(raw.LOW24HOUR) ? raw.LOW24HOUR : null
  };
}

export async function getHourlyOHLC(
  symbolInput: string,
  limit = 24,
  quoteSymbolInput = "USDT"
): Promise<Candle[]> {
  const symbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  try {
    const response = await axios.get(
      "https://min-api.cryptocompare.com/data/v2/histohour",
      {
        params: {
          fsym: symbol,
          tsym: quoteSymbol,
          limit
        },
        headers: buildHeaders(),
        timeout: 10000
      }
    );

    const rows = response.data?.Data?.Data;

    if (!Array.isArray(rows)) {
      warnInvalidOhlc("hourly", symbol, quoteSymbol);
      return [];
    }

    return mapRows(rows);
  } catch (error) {
    console.warn(
      `CryptoCompare hourly OHLC request failed for ${symbol}/${quoteSymbol}:`,
      error
    );
    return [];
  }
}

export async function getDailyOHLC(
  symbolInput: string,
  limit = 30,
  quoteSymbolInput = "USDT"
): Promise<Candle[]> {
  const symbol = normalizeSymbol(symbolInput);
  const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);

  try {
    const response = await axios.get(
      "https://min-api.cryptocompare.com/data/v2/histoday",
      {
        params: {
          fsym: symbol,
          tsym: quoteSymbol,
          limit
        },
        headers: buildHeaders(),
        timeout: 10000
      }
    );

    const rows = response.data?.Data?.Data;

    if (!Array.isArray(rows)) {
      warnInvalidOhlc("daily", symbol, quoteSymbol);
      return [];
    }

    return mapRows(rows);
  } catch (error) {
    console.warn(
      `CryptoCompare daily OHLC request failed for ${symbol}/${quoteSymbol}:`,
      error
    );
    return [];
  }
}