"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBuyScanResult = getBuyScanResult;
const market_service_1 = require("./market.service");
const signal_service_1 = require("./signal.service");
const symbols_1 = require("../utils/symbols");
const CANDIDATE_SYMBOLS = Object.keys(symbols_1.SYMBOL_TO_COINCAP_ID);
async function mapWithConcurrency(items, concurrency, worker) {
    const results = [];
    let currentIndex = 0;
    async function run() {
        while (currentIndex < items.length) {
            const index = currentIndex++;
            results[index] = await worker(items[index]);
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
    return results;
}
function average(values) {
    const filtered = values.filter((value) => value !== null && Number.isFinite(value));
    if (!filtered.length) {
        return null;
    }
    const sum = filtered.reduce((acc, value) => acc + value, 0);
    return sum / filtered.length;
}
function buildNoBuyExplanation(summary) {
    const reasons = [];
    if (summary.buyCount > 0) {
        return "На рынке есть пары с подтвержденным сигналом BUY.";
    }
    if (summary.sidewaysCount >= summary.bullishCount &&
        summary.sidewaysCount >= summary.bearishCount) {
        reasons.push("по большинству монет рынок сейчас боковой");
    }
    if (summary.bearishCount > summary.bullishCount) {
        reasons.push("медвежьих сценариев больше, чем бычьих");
    }
    if (summary.avgChange30d !== null &&
        Number.isFinite(summary.avgChange30d) &&
        summary.avgChange30d < 5) {
        reasons.push("средний импульс за 30 дней слишком слабый для уверенного BUY");
    }
    if (summary.avgRsi14 !== null &&
        Number.isFinite(summary.avgRsi14) &&
        summary.avgRsi14 > 65) {
        reasons.push("часть рынка выглядит перегретой по RSI");
    }
    if (summary.avgRsi14 !== null &&
        Number.isFinite(summary.avgRsi14) &&
        summary.avgRsi14 >= 45 &&
        summary.avgRsi14 <= 60 &&
        summary.sidewaysCount >= summary.bullishCount) {
        reasons.push("RSI в среднем нейтральный, но без сильного трендового подтверждения");
    }
    if (!reasons.length) {
        reasons.push("сейчас нет монет, которые одновременно проходят фильтры по тренду, месячному импульсу, RSI и положению относительно SMA30");
    }
    return reasons.join(", ");
}
function toSummary(items) {
    const buyCount = items.filter((item) => item.signal === "BUY").length;
    const holdCount = items.filter((item) => item.signal === "HOLD").length;
    const sellCount = items.filter((item) => item.signal === "SELL").length;
    const bullishCount = items.filter((item) => item.trend30d === "BULLISH").length;
    const sidewaysCount = items.filter((item) => item.trend30d === "SIDEWAYS").length;
    const bearishCount = items.filter((item) => item.trend30d === "BEARISH").length;
    const avgChange30d = average(items.map((item) => item.change30d));
    const avgRsi14 = average(items.map((item) => item.rsi14));
    return {
        totalChecked: items.length,
        buyCount,
        holdCount,
        sellCount,
        bullishCount,
        sidewaysCount,
        bearishCount,
        avgChange30d,
        avgRsi14,
        explanation: buildNoBuyExplanation({
            buyCount,
            holdCount,
            sellCount,
            bullishCount,
            sidewaysCount,
            bearishCount,
            avgChange30d,
            avgRsi14,
        }),
    };
}
async function getBuyScanResult(limit = 10) {
    const evaluated = await mapWithConcurrency(CANDIDATE_SYMBOLS, 4, async (symbol) => {
        try {
            const market = await (0, market_service_1.buildMarketContext)(symbol);
            const evaluation = (0, signal_service_1.evaluateMarketSignal)(market);
            if (!evaluation) {
                return null;
            }
            return {
                pair: evaluation.pair,
                symbol: evaluation.symbol,
                name: evaluation.name,
                priceUsd: evaluation.priceUsd,
                change24h: evaluation.change24h,
                change30d: evaluation.change30d,
                trend30d: evaluation.trend30d,
                rsi14: evaluation.rsi14,
                score: evaluation.score,
                signal: evaluation.signal,
                reason: evaluation.reason,
            };
        }
        catch (error) {
            console.error(`Buy scan failed for ${symbol}:`, error);
            return null;
        }
    });
    const validItems = evaluated.filter((item) => item !== null);
    const summary = toSummary(validItems);
    const buys = validItems
        .filter((item) => item.signal === "BUY")
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((item, index) => ({
        rank: index + 1,
        pair: item.pair,
        symbol: item.symbol,
        name: item.name,
        priceUsd: item.priceUsd,
        change24h: item.change24h,
        change30d: item.change30d,
        trend30d: item.trend30d,
        rsi14: item.rsi14,
        score: item.score,
        signal: "BUY",
        reason: item.reason,
    }));
    return {
        buys,
        summary,
    };
}
//# sourceMappingURL=buy.service.js.map