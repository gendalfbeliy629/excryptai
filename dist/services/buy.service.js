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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function round(value) {
    return Number(value.toFixed(8));
}
function percentDifference(from, to) {
    if (!Number.isFinite(from) || !Number.isFinite(to) || from <= 0) {
        return 0;
    }
    return Number((((to - from) / from) * 100).toFixed(2));
}
function buildTradePlan(item) {
    const { priceUsd, high30d, low30d, sma30, rangePosition, pullbackFromHigh, change30d, } = item;
    let buyPriceUsd = priceUsd;
    if (sma30 !== null &&
        Number.isFinite(sma30) &&
        sma30 > 0 &&
        priceUsd > sma30) {
        const premiumToSma = ((priceUsd - sma30) / sma30) * 100;
        if (premiumToSma >= 3) {
            buyPriceUsd = Math.min(priceUsd, sma30 * 1.02);
        }
    }
    if (rangePosition !== null &&
        Number.isFinite(rangePosition) &&
        rangePosition > 60 &&
        rangePosition <= 75) {
        buyPriceUsd = Math.min(buyPriceUsd, priceUsd * 0.99);
    }
    if (pullbackFromHigh !== null &&
        Number.isFinite(pullbackFromHigh) &&
        pullbackFromHigh >= 5 &&
        pullbackFromHigh <= 15) {
        buyPriceUsd = Math.min(buyPriceUsd, priceUsd);
    }
    buyPriceUsd = round(buyPriceUsd);
    const stopCandidates = [buyPriceUsd * 0.92];
    if (sma30 !== null &&
        Number.isFinite(sma30) &&
        sma30 > 0 &&
        sma30 < buyPriceUsd) {
        stopCandidates.push(sma30 * 0.97);
    }
    if (low30d !== null &&
        Number.isFinite(low30d) &&
        low30d > 0 &&
        low30d < buyPriceUsd) {
        stopCandidates.push(low30d * 0.99);
    }
    let initialStopLossUsd = Math.max(...stopCandidates.filter((candidate) => Number.isFinite(candidate) && candidate < buyPriceUsd));
    let riskPercent = percentDifference(buyPriceUsd, initialStopLossUsd) * -1;
    if (Math.abs(riskPercent) < 4) {
        initialStopLossUsd = buyPriceUsd * 0.96;
    }
    if (Math.abs(riskPercent) > 12) {
        initialStopLossUsd = buyPriceUsd * 0.88;
    }
    initialStopLossUsd = round(initialStopLossUsd);
    riskPercent = Math.abs(percentDifference(buyPriceUsd, initialStopLossUsd));
    const riskDistanceUsd = Math.max(buyPriceUsd - initialStopLossUsd, buyPriceUsd * 0.03);
    let tp1Usd = buyPriceUsd + riskDistanceUsd * 1.0;
    let tp2Usd = buyPriceUsd + riskDistanceUsd * 2.0;
    let tp3Usd = buyPriceUsd + riskDistanceUsd * 3.0;
    if (high30d !== null &&
        Number.isFinite(high30d) &&
        high30d > buyPriceUsd) {
        const resistanceSoft = high30d * 0.95;
        const resistanceMain = high30d * 0.98;
        const breakoutTarget = high30d * 1.05;
        tp1Usd = Math.max(tp1Usd, Math.min(resistanceSoft, buyPriceUsd * 1.08));
        tp2Usd = Math.max(tp2Usd, resistanceMain);
        tp3Usd = Math.max(tp3Usd, breakoutTarget);
    }
    if (change30d !== null &&
        Number.isFinite(change30d) &&
        change30d > 0) {
        const momentum = clamp(change30d, 8, 30);
        tp1Usd = Math.max(tp1Usd, buyPriceUsd * (1 + Math.min(momentum * 0.35, 8) / 100));
        tp2Usd = Math.max(tp2Usd, buyPriceUsd * (1 + Math.min(momentum * 0.7, 16) / 100));
        tp3Usd = Math.max(tp3Usd, buyPriceUsd * (1 + Math.min(momentum * 1.1, 28) / 100));
    }
    if (tp1Usd <= buyPriceUsd)
        tp1Usd = buyPriceUsd * 1.05;
    if (tp2Usd <= tp1Usd)
        tp2Usd = tp1Usd * 1.05;
    if (tp3Usd <= tp2Usd)
        tp3Usd = tp2Usd * 1.05;
    tp1Usd = round(tp1Usd);
    tp2Usd = round(tp2Usd);
    tp3Usd = round(tp3Usd);
    const tp1Percent = percentDifference(buyPriceUsd, tp1Usd);
    const tp2Percent = percentDifference(buyPriceUsd, tp2Usd);
    const tp3Percent = percentDifference(buyPriceUsd, tp3Usd);
    const riskRewardTp1 = Number(((tp1Usd - buyPriceUsd) /
        Math.max(buyPriceUsd - initialStopLossUsd, 0.00000001)).toFixed(2));
    const riskRewardTp2 = Number(((tp2Usd - buyPriceUsd) /
        Math.max(buyPriceUsd - initialStopLossUsd, 0.00000001)).toFixed(2));
    const riskRewardTp3 = Number(((tp3Usd - buyPriceUsd) /
        Math.max(buyPriceUsd - initialStopLossUsd, 0.00000001)).toFixed(2));
    const breakEvenPriceUsd = round(buyPriceUsd * 1.001);
    let trailingStopPercent = 3.5;
    if (change30d !== null &&
        Number.isFinite(change30d) &&
        change30d >= 20) {
        trailingStopPercent = 5.5;
    }
    else if (change30d !== null &&
        Number.isFinite(change30d) &&
        change30d >= 12) {
        trailingStopPercent = 4.5;
    }
    const trailingStopAfterTp1Usd = round(Math.max(breakEvenPriceUsd, tp1Usd * (1 - trailingStopPercent / 100)));
    const managementPlan = [
        `Входить не выше ${round(buyPriceUsd)}`,
        `Начальный стоп поставить на ${round(initialStopLossUsd)}`,
        `На TP1 (${round(tp1Usd)}) можно зафиксировать 25-35% позиции`,
        `После достижения TP1 стоп перевести в безубыток: ${round(breakEvenPriceUsd)}`,
        `Далее включить trailing-stop ${trailingStopPercent.toFixed(1)}% (ориентир: ${round(trailingStopAfterTp1Usd)})`,
        `На TP2 (${round(tp2Usd)}) можно закрыть еще 35-50% позиции`,
        `Остаток держать до TP3 (${round(tp3Usd)}) или до срабатывания trailing-stop`,
    ];
    return {
        buyPriceUsd,
        initialStopLossUsd,
        breakEvenPriceUsd,
        trailingStopAfterTp1Usd,
        trailingStopPercent,
        tp1Usd,
        tp2Usd,
        tp3Usd,
        tp1Percent,
        tp2Percent,
        tp3Percent,
        riskPercent,
        riskRewardTp1,
        riskRewardTp2,
        riskRewardTp3,
        managementPlan,
    };
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
                high30d: evaluation.high30d,
                low30d: evaluation.low30d,
                sma30: evaluation.sma30,
                rangePosition: evaluation.rangePosition,
                pullbackFromHigh: evaluation.pullbackFromHigh,
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
        .map((item, index) => {
        const tradePlan = buildTradePlan({
            priceUsd: item.priceUsd,
            high30d: item.high30d,
            low30d: item.low30d,
            sma30: item.sma30,
            rangePosition: item.rangePosition,
            pullbackFromHigh: item.pullbackFromHigh,
            change30d: item.change30d,
        });
        return {
            rank: index + 1,
            pair: item.pair,
            symbol: item.symbol,
            name: item.name,
            priceUsd: item.priceUsd,
            buyPriceUsd: tradePlan.buyPriceUsd,
            initialStopLossUsd: tradePlan.initialStopLossUsd,
            breakEvenPriceUsd: tradePlan.breakEvenPriceUsd,
            trailingStopAfterTp1Usd: tradePlan.trailingStopAfterTp1Usd,
            trailingStopPercent: tradePlan.trailingStopPercent,
            tp1Usd: tradePlan.tp1Usd,
            tp2Usd: tradePlan.tp2Usd,
            tp3Usd: tradePlan.tp3Usd,
            tp1Percent: tradePlan.tp1Percent,
            tp2Percent: tradePlan.tp2Percent,
            tp3Percent: tradePlan.tp3Percent,
            riskPercent: tradePlan.riskPercent,
            riskRewardTp1: tradePlan.riskRewardTp1,
            riskRewardTp2: tradePlan.riskRewardTp2,
            riskRewardTp3: tradePlan.riskRewardTp3,
            change24h: item.change24h,
            change30d: item.change30d,
            trend30d: item.trend30d,
            rsi14: item.rsi14,
            score: item.score,
            signal: "BUY",
            reason: item.reason,
            managementPlan: tradePlan.managementPlan,
        };
    });
    return {
        buys,
        summary,
    };
}
//# sourceMappingURL=buy.service.js.map