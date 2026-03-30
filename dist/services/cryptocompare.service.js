"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHourlyOHLC = getHourlyOHLC;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const symbols_1 = require("../utils/symbols");
async function getHourlyOHLC(symbolInput, limit = 24) {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const headers = {};
    if (env_1.env.CRYPTOCOMPARE_API_KEY) {
        headers.authorization = `Apikey ${env_1.env.CRYPTOCOMPARE_API_KEY}`;
    }
    const response = await axios_1.default.get("https://min-api.cryptocompare.com/data/v2/histohour", {
        params: {
            fsym: symbol,
            tsym: "USD",
            limit,
        },
        headers,
        timeout: 10000,
    });
    const rows = response.data?.Data?.Data;
    if (!Array.isArray(rows)) {
        throw new Error(`CryptoCompare returned invalid OHLC for ${symbol}`);
    }
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
//# sourceMappingURL=cryptocompare.service.js.map