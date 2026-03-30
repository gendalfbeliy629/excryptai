"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCoinInfo = getCoinInfo;
exports.getOHLC = getOHLC;
exports.buildMarketContext = buildMarketContext;
exports.getMarketData = getMarketData;
exports.getCandles = getCandles;
const coincap_service_1 = require("./coincap.service");
const cryptocompare_service_1 = require("./cryptocompare.service");
const defillama_service_1 = require("./defillama.service");
const santiment_service_1 = require("./santiment.service");
const symbols_1 = require("../utils/symbols");
function calculateRSI(closes, period = 14) {
    if (closes.length <= period)
        return null;
    let gains = 0;
    let losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0)
            gains += diff;
        else
            losses += Math.abs(diff);
    }
    let avgGain = gains / period;
    let avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const gain = diff > 0 ? diff : 0;
        const loss = diff < 0 ? Math.abs(diff) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (avgLoss === 0)
        return 100;
    const rs = avgGain / avgLoss;
    return 100 - 100 / (1 + rs);
}
async function getCoinInfo(symbolInput) {
    const spot = await (0, coincap_service_1.getSpotPrice)(symbolInput);
    return {
        symbol: spot.symbol,
        name: spot.name,
        priceUsd: spot.priceUsd,
        change24h: spot.changePercent24Hr,
        marketCapUsd: spot.marketCapUsd,
        volume24hUsd: null,
        source: "CoinCap",
    };
}
async function getOHLC(symbolInput, limit = 30) {
    const candles = await (0, cryptocompare_service_1.getHourlyOHLC)(symbolInput, Math.max(limit, 15));
    return candles.map((row) => ({
        time: row.time,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volumeFrom: row.volumeFrom,
        volumeTo: row.volumeTo,
    }));
}
async function buildMarketContext(symbolInput) {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const [spot, candles, liquidity, sentiment] = await Promise.all([
        (0, coincap_service_1.getSpotPrice)(symbol),
        getOHLC(symbol, 24),
        (0, defillama_service_1.getLiquiditySnapshot)(symbol),
        (0, santiment_service_1.getSentimentSnapshot)(symbol),
    ]);
    const highs = candles.map((c) => c.high).filter((v) => Number.isFinite(v));
    const lows = candles.map((c) => c.low).filter((v) => Number.isFinite(v));
    const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v));
    return {
        asset: {
            symbol: spot.symbol,
            name: spot.name,
            id: spot.id,
        },
        spot: {
            priceUsd: spot.priceUsd,
            change24h: spot.changePercent24Hr,
            marketCapUsd: spot.marketCapUsd,
        },
        technicals: {
            high24h: highs.length ? Math.max(...highs) : null,
            low24h: lows.length ? Math.min(...lows) : null,
            rsi14: calculateRSI(closes, 14),
            candles,
        },
        liquidity,
        sentiment,
    };
}
async function getMarketData(symbol) {
    return getCoinInfo(symbol);
}
async function getCandles(symbol, limit = 30) {
    return getOHLC(symbol, limit);
}
//# sourceMappingURL=market.service.js.map