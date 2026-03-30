"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeCoin = analyzeCoin;
const market_service_1 = require("./market.service");
function calculateSMA(values, period) {
    if (values.length < period)
        return null;
    const slice = values.slice(values.length - period);
    const sum = slice.reduce((acc, val) => acc + val, 0);
    return sum / period;
}
function getTrend(closePrices) {
    const sma7 = calculateSMA(closePrices, 7);
    const sma25 = calculateSMA(closePrices, 25);
    if (sma7 === null || sma25 === null)
        return "SIDEWAYS";
    if (sma7 > sma25)
        return "BULLISH";
    if (sma7 < sma25)
        return "BEARISH";
    return "SIDEWAYS";
}
function getSignal(trend, change24h) {
    if (trend === "BULLISH" && (change24h ?? 0) >= 0)
        return "BUY";
    if (trend === "BEARISH" && (change24h ?? 0) < 0)
        return "SELL";
    return "HOLD";
}
function buildSummary(params) {
    const { symbol, currentPrice, change24h, trend, signal } = params;
    const priceText = currentPrice !== null ? `$${currentPrice.toFixed(4)}` : "нет данных";
    const changeText = change24h !== null ? `${change24h.toFixed(2)}%` : "нет данных";
    return [
        `Монета: ${symbol}`,
        `Текущая цена: ${priceText}`,
        `Изменение за 24ч: ${changeText}`,
        `Краткосрочный тренд: ${trend}`,
        `Сигнал: ${signal}`,
    ].join("\n");
}
async function analyzeCoin(symbol) {
    const coin = await (0, market_service_1.getCoinInfo)(symbol);
    const candles = await (0, market_service_1.getOHLC)(symbol, 30);
    const closePrices = candles
        .map((c) => c.close)
        .filter((v) => Number.isFinite(v) && v > 0);
    const trend = getTrend(closePrices);
    const signal = getSignal(trend, coin.change24h);
    return {
        symbol: coin.symbol,
        currentPrice: coin.priceUsd,
        change24h: coin.change24h,
        marketCapUsd: coin.marketCapUsd,
        volume24hUsd: coin.volume24hUsd,
        trend,
        signal,
        summary: buildSummary({
            symbol: coin.symbol,
            currentPrice: coin.priceUsd,
            change24h: coin.change24h,
            trend,
            signal,
        }),
        candlesCount: candles.length,
    };
}
//# sourceMappingURL=analysis.service.js.map