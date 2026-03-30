"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPairPrice = getPairPrice;
exports.getHourlyOHLC = getHourlyOHLC;
exports.getDailyOHLC = getDailyOHLC;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const symbols_1 = require("../utils/symbols");
function buildHeaders() {
    const headers = {};
    if (env_1.env.CRYPTOCOMPARE_API_KEY) {
        headers.authorization = `Apikey ${env_1.env.CRYPTOCOMPARE_API_KEY}`;
    }
    return headers;
}
function normalizeQuoteSymbol(input) {
    return input.trim().toUpperCase().replace(/\//g, "");
}
function mapRows(rows) {
    return rows.map((row) => ({
        time: Number(row.time),
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volumeFrom: Number(row.volumefrom),
        volumeTo: Number(row.volumeto),
    }));
}
async function getPairPrice(baseSymbolInput, quoteSymbolInput = "USDT") {
    const fromSymbol = (0, symbols_1.normalizeSymbol)(baseSymbolInput);
    const toSymbol = normalizeQuoteSymbol(quoteSymbolInput);
    const response = await axios_1.default.get("https://min-api.cryptocompare.com/data/pricemultifull", {
        params: {
            fsyms: fromSymbol,
            tsyms: toSymbol,
        },
        headers: buildHeaders(),
        timeout: 10000,
    });
    const raw = response.data?.RAW?.[fromSymbol]?.[toSymbol];
    if (!raw) {
        throw new Error(`CryptoCompare returned empty pair price for ${fromSymbol}/${toSymbol}`);
    }
    return {
        fromSymbol,
        toSymbol,
        price: Number(raw.PRICE),
        change24h: typeof raw.CHANGEPCT24HOUR === "number" ? raw.CHANGEPCT24HOUR : null,
        high24h: typeof raw.HIGH24HOUR === "number" ? raw.HIGH24HOUR : null,
        low24h: typeof raw.LOW24HOUR === "number" ? raw.LOW24HOUR : null,
    };
}
async function getHourlyOHLC(symbolInput, limit = 24, quoteSymbolInput = "USDT") {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);
    const response = await axios_1.default.get("https://min-api.cryptocompare.com/data/v2/histohour", {
        params: {
            fsym: symbol,
            tsym: quoteSymbol,
            limit,
        },
        headers: buildHeaders(),
        timeout: 10000,
    });
    const rows = response.data?.Data?.Data;
    if (!Array.isArray(rows)) {
        throw new Error(`CryptoCompare returned invalid hourly OHLC for ${symbol}/${quoteSymbol}`);
    }
    return mapRows(rows);
}
async function getDailyOHLC(symbolInput, limit = 30, quoteSymbolInput = "USDT") {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const quoteSymbol = normalizeQuoteSymbol(quoteSymbolInput);
    const response = await axios_1.default.get("https://min-api.cryptocompare.com/data/v2/histoday", {
        params: {
            fsym: symbol,
            tsym: quoteSymbol,
            limit,
        },
        headers: buildHeaders(),
        timeout: 10000,
    });
    const rows = response.data?.Data?.Data;
    if (!Array.isArray(rows)) {
        throw new Error(`CryptoCompare returned invalid daily OHLC for ${symbol}/${quoteSymbol}`);
    }
    return mapRows(rows);
}
//# sourceMappingURL=cryptocompare.service.js.map