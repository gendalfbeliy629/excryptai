"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSpotPrice = getSpotPrice;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const cache_1 = require("../utils/cache");
const symbols_1 = require("../utils/symbols");
const cache = new cache_1.TTLCache();
const TTL_MS = 60000;
async function getSpotPrice(symbolInput) {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const assetId = symbols_1.SYMBOL_TO_COINCAP_ID[symbol];
    if (!assetId) {
        throw new Error(`Unsupported symbol for CoinCap: ${symbol}`);
    }
    const cached = cache.get(assetId);
    if (cached)
        return cached;
    const headers = {};
    if (env_1.env.COINCAP_API_KEY) {
        headers.Authorization = `Bearer ${env_1.env.COINCAP_API_KEY}`;
    }
    const response = await axios_1.default.get(`https://rest.coincap.io/v3/assets/${assetId}`, {
        headers,
        timeout: 10000,
    });
    const raw = response.data?.data;
    if (!raw) {
        throw new Error(`CoinCap returned empty data for ${symbol}`);
    }
    const result = {
        id: raw.id,
        symbol: raw.symbol,
        name: raw.name,
        priceUsd: Number(raw.priceUsd),
        marketCapUsd: raw.marketCapUsd ? Number(raw.marketCapUsd) : null,
        changePercent24Hr: raw.changePercent24Hr ? Number(raw.changePercent24Hr) : null,
    };
    cache.set(assetId, result, TTL_MS);
    return result;
}
//# sourceMappingURL=coincap.service.js.map