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
function calculateSMA(values, period) {
    if (values.length < period)
        return null;
    const slice = values.slice(values.length - period);
    const sum = slice.reduce((acc, value) => acc + value, 0);
    return sum / period;
}
function calculatePercentChange(start, end) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= 0) {
        return null;
    }
    return ((end - start) / start) * 100;
}
function detectTrend(closes, sma7, sma30) {
    if (closes.length < 7 || sma7 === null || sma30 === null) {
        return "SIDEWAYS";
    }
    const lastClose = closes[closes.length - 1];
    const firstClose = closes[0];
    const change = calculatePercentChange(firstClose, lastClose);
    if (change === null) {
        return "SIDEWAYS";
    }
    if (sma7 > sma30 && change > 3) {
        return "BULLISH";
    }
    if (sma7 < sma30 && change < -3) {
        return "BEARISH";
    }
    return "SIDEWAYS";
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
    const candles = await (0, cryptocompare_service_1.getDailyOHLC)(symbolInput, Math.max(limit, 30));
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
        getOHLC(symbol, 30),
        (0, defillama_service_1.getLiquiditySnapshot)(symbol),
        (0, santiment_service_1.getSentimentSnapshot)(symbol),
    ]);
    const highs = candles.map((c) => c.high).filter((v) => Number.isFinite(v));
    const lows = candles.map((c) => c.low).filter((v) => Number.isFinite(v));
    const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v));
    const firstClose = closes[0];
    const lastClose = closes[closes.length - 1];
    const sma7 = calculateSMA(closes, 7);
    const sma30 = calculateSMA(closes, 30);
    const change30d = calculatePercentChange(firstClose, lastClose);
    const trend30d = detectTrend(closes, sma7, sma30);
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
            period: "30d",
            high30d: highs.length ? Math.max(...highs) : null,
            low30d: lows.length ? Math.min(...lows) : null,
            change30d,
            rsi14: calculateRSI(closes, 14),
            sma7,
            sma30,
            trend30d,
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