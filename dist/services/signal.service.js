"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateMarketSignal = evaluateMarketSignal;
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function round(value) {
    return Number(value.toFixed(2));
}
function getRangePosition(price, low, high) {
    if (low === null ||
        high === null ||
        !Number.isFinite(low) ||
        !Number.isFinite(high) ||
        high <= low) {
        return null;
    }
    const pos = ((price - low) / (high - low)) * 100;
    return clamp(pos, 0, 100);
}
function getPullbackFromHigh(price, high) {
    if (high === null ||
        !Number.isFinite(high) ||
        high <= 0 ||
        !Number.isFinite(price) ||
        price <= 0) {
        return null;
    }
    return ((high - price) / high) * 100;
}
function scoreTrend(trend) {
    if (trend === "BULLISH")
        return 24;
    if (trend === "SIDEWAYS")
        return 0;
    return -24;
}
function scoreChange30d(change30d) {
    if (change30d === null || !Number.isFinite(change30d))
        return 0;
    if (change30d >= 6 && change30d <= 25)
        return 18;
    if (change30d > 25 && change30d <= 45)
        return 10;
    if (change30d >= 2 && change30d < 6)
        return 8;
    if (change30d >= 0 && change30d < 2)
        return 2;
    if (change30d > -6 && change30d < 0)
        return -6;
    if (change30d <= -20)
        return -20;
    return -12;
}
function scoreRsi(rsi) {
    if (rsi === null || !Number.isFinite(rsi))
        return 0;
    if (rsi >= 46 && rsi <= 62)
        return 16;
    if (rsi >= 40 && rsi < 46)
        return 8;
    if (rsi > 62 && rsi <= 68)
        return 4;
    if (rsi > 68 && rsi <= 75)
        return -12;
    if (rsi < 35)
        return -8;
    return 0;
}
function scoreRangePosition(position) {
    if (position === null || !Number.isFinite(position))
        return 0;
    if (position >= 25 && position <= 60)
        return 12;
    if (position > 60 && position <= 75)
        return 6;
    if (position >= 15 && position < 25)
        return 5;
    if (position > 85)
        return -12;
    if (position < 10)
        return -8;
    return 0;
}
function scorePullback(pullbackFromHigh) {
    if (pullbackFromHigh === null ||
        !Number.isFinite(pullbackFromHigh)) {
        return 0;
    }
    if (pullbackFromHigh >= 5 && pullbackFromHigh <= 15)
        return 8;
    if (pullbackFromHigh > 15 && pullbackFromHigh <= 25)
        return 4;
    if (pullbackFromHigh >= 0 && pullbackFromHigh < 3)
        return -6;
    if (pullbackFromHigh > 30)
        return -6;
    return 0;
}
function scoreSmaPosition(price, sma30) {
    if (sma30 === null || !Number.isFinite(sma30) || sma30 <= 0)
        return 0;
    if (price > sma30)
        return 8;
    if (price === sma30)
        return 1;
    return -8;
}
function scoreLiquidity(totalTvlUsd) {
    if (totalTvlUsd === null ||
        !Number.isFinite(totalTvlUsd) ||
        totalTvlUsd <= 0) {
        return 0;
    }
    if (totalTvlUsd >= 10000000000)
        return 8;
    if (totalTvlUsd >= 1000000000)
        return 6;
    if (totalTvlUsd >= 100000000)
        return 4;
    return 2;
}
function scoreSentiment(socialVolumeTotal, socialDominanceLatest) {
    let score = 0;
    if (socialVolumeTotal !== null &&
        Number.isFinite(socialVolumeTotal) &&
        socialVolumeTotal > 0) {
        score += 2;
    }
    if (socialDominanceLatest !== null &&
        Number.isFinite(socialDominanceLatest) &&
        socialDominanceLatest > 0) {
        score += 2;
    }
    return score;
}
function buildPositives(params) {
    const positives = [];
    if (params.trend30d === "BULLISH") {
        positives.push("бычий тренд за 30 дней");
    }
    if (params.change30d !== null &&
        Number.isFinite(params.change30d) &&
        params.change30d >= 6 &&
        params.change30d <= 25) {
        positives.push("здоровый рост за месяц");
    }
    if (params.rsi14 !== null &&
        Number.isFinite(params.rsi14) &&
        params.rsi14 >= 46 &&
        params.rsi14 <= 62) {
        positives.push("RSI в комфортной зоне");
    }
    if (params.rangePosition !== null &&
        Number.isFinite(params.rangePosition) &&
        params.rangePosition >= 25 &&
        params.rangePosition <= 60) {
        positives.push("цена не перегрета внутри диапазона 30д");
    }
    if (params.pullbackFromHigh !== null &&
        Number.isFinite(params.pullbackFromHigh) &&
        params.pullbackFromHigh >= 5 &&
        params.pullbackFromHigh <= 15) {
        positives.push("есть умеренный откат от high 30д");
    }
    if (params.sma30 !== null &&
        Number.isFinite(params.sma30) &&
        params.priceUsd > params.sma30) {
        positives.push("цена выше SMA30");
    }
    if (params.totalTvlUsd !== null &&
        Number.isFinite(params.totalTvlUsd) &&
        params.totalTvlUsd > 0) {
        positives.push("есть подтверждение ликвидностью");
    }
    if ((params.socialVolumeTotal !== null &&
        Number.isFinite(params.socialVolumeTotal) &&
        params.socialVolumeTotal > 0) ||
        (params.socialDominanceLatest !== null &&
            Number.isFinite(params.socialDominanceLatest) &&
            params.socialDominanceLatest > 0)) {
        positives.push("есть признаки рыночного внимания");
    }
    return positives;
}
function buildNegatives(params) {
    const negatives = [];
    if (params.trend30d === "SIDEWAYS") {
        negatives.push("тренд за 30 дней боковой");
    }
    if (params.trend30d === "BEARISH") {
        negatives.push("тренд за 30 дней медвежий");
    }
    if (params.change30d !== null &&
        Number.isFinite(params.change30d) &&
        params.change30d > -2 &&
        params.change30d < 5) {
        negatives.push("месячный импульс слабый");
    }
    if (params.rsi14 !== null &&
        Number.isFinite(params.rsi14) &&
        params.rsi14 > 68) {
        negatives.push("RSI показывает перегретость");
    }
    if (params.rangePosition !== null &&
        Number.isFinite(params.rangePosition) &&
        params.rangePosition > 85) {
        negatives.push("цена близко к верхней границе диапазона 30д");
    }
    if (params.sma30 !== null &&
        Number.isFinite(params.sma30) &&
        params.priceUsd < params.sma30) {
        negatives.push("цена ниже SMA30");
    }
    if (params.change24h !== null &&
        Number.isFinite(params.change24h) &&
        params.change24h < -8) {
        negatives.push("сильная просадка за 24 часа");
    }
    const noLiquidity = params.totalTvlUsd === null ||
        !Number.isFinite(params.totalTvlUsd) ||
        params.totalTvlUsd <= 0;
    const noSentiment = (params.socialVolumeTotal === null ||
        !Number.isFinite(params.socialVolumeTotal) ||
        params.socialVolumeTotal <= 0) &&
        (params.socialDominanceLatest === null ||
            !Number.isFinite(params.socialDominanceLatest) ||
            params.socialDominanceLatest <= 0);
    if (noLiquidity && noSentiment) {
        negatives.push("нет подтверждения ликвидностью и sentiment");
    }
    return negatives;
}
function buildSignal(params) {
    const { score, trend30d, change30d, rsi14, rangePosition, priceUsd, sma30 } = params;
    const priceAboveSma30 = sma30 === null || !Number.isFinite(sma30) || priceUsd >= sma30;
    const strongBuy = score >= 60 &&
        trend30d === "BULLISH" &&
        change30d !== null &&
        Number.isFinite(change30d) &&
        change30d >= 5 &&
        (rsi14 === null || (rsi14 >= 45 && rsi14 <= 68)) &&
        priceAboveSma30;
    if (strongBuy) {
        return "BUY";
    }
    const strongSellByTrend = trend30d === "BEARISH" &&
        change30d !== null &&
        Number.isFinite(change30d) &&
        change30d <= -6 &&
        score < 35;
    const strongSellByOverheat = rsi14 !== null &&
        Number.isFinite(rsi14) &&
        rsi14 > 74 &&
        rangePosition !== null &&
        Number.isFinite(rangePosition) &&
        rangePosition > 85;
    if (strongSellByTrend || strongSellByOverheat) {
        return "SELL";
    }
    return "HOLD";
}
function buildReason(signal, positives, negatives) {
    if (signal === "BUY") {
        if (positives.length > 0) {
            return positives.slice(0, 4).join(", ");
        }
        return "сигнал BUY получен по совокупности технических факторов";
    }
    if (signal === "SELL") {
        if (negatives.length > 0) {
            return negatives.slice(0, 4).join(", ");
        }
        return "сигнал SELL получен по совокупности технических факторов";
    }
    const parts = [...negatives.slice(0, 2), ...positives.slice(0, 2)];
    if (parts.length > 0) {
        return parts.join(", ");
    }
    return "данные смешанные, явного преимущества у BUY или SELL нет";
}
function evaluateMarketSignal(market) {
    const priceUsd = market.spot.priceUsd;
    const change24h = market.spot.change24h;
    const change30d = market.technicals.change30d;
    const trend30d = market.technicals.trend30d;
    const rsi14 = market.technicals.rsi14;
    const high30d = market.technicals.high30d;
    const low30d = market.technicals.low30d;
    const sma7 = market.technicals.sma7;
    const sma30 = market.technicals.sma30;
    if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
        return null;
    }
    const rangePosition = getRangePosition(priceUsd, low30d, high30d);
    const pullbackFromHigh = getPullbackFromHigh(priceUsd, high30d);
    let score = 0;
    score += scoreTrend(trend30d);
    score += scoreChange30d(change30d);
    score += scoreRsi(rsi14);
    score += scoreRangePosition(rangePosition);
    score += scorePullback(pullbackFromHigh);
    score += scoreSmaPosition(priceUsd, sma30);
    score += scoreLiquidity(market.liquidity.totalTvlUsd);
    score += scoreSentiment(market.sentiment.socialVolumeTotal, market.sentiment.socialDominanceLatest);
    if (change24h !== null &&
        Number.isFinite(change24h) &&
        change24h < -8) {
        score -= 8;
    }
    if (change24h !== null &&
        Number.isFinite(change24h) &&
        change24h > 10) {
        score -= 4;
    }
    const finalScore = round(score);
    const positives = buildPositives({
        trend30d,
        change30d,
        rsi14,
        rangePosition,
        pullbackFromHigh,
        priceUsd,
        sma30,
        totalTvlUsd: market.liquidity.totalTvlUsd,
        socialVolumeTotal: market.sentiment.socialVolumeTotal,
        socialDominanceLatest: market.sentiment.socialDominanceLatest,
    });
    const negatives = buildNegatives({
        trend30d,
        change24h,
        change30d,
        rsi14,
        rangePosition,
        priceUsd,
        sma30,
        totalTvlUsd: market.liquidity.totalTvlUsd,
        socialVolumeTotal: market.sentiment.socialVolumeTotal,
        socialDominanceLatest: market.sentiment.socialDominanceLatest,
    });
    const signal = buildSignal({
        score: finalScore,
        trend30d,
        change30d,
        rsi14,
        rangePosition,
        priceUsd,
        sma30,
    });
    return {
        pair: market.pair.display,
        symbol: market.asset.symbol,
        name: market.asset.name,
        priceUsd,
        change24h,
        change30d,
        trend30d,
        rsi14,
        high30d,
        low30d,
        sma7,
        sma30,
        rangePosition,
        pullbackFromHigh,
        score: finalScore,
        signal,
        reason: buildReason(signal, positives, negatives),
        positives,
        negatives,
    };
}
//# sourceMappingURL=signal.service.js.map