"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAI = askAI;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const env_1 = require("../config/env");
const signal_service_1 = require("./signal.service");
const groq = new groq_sdk_1.default({
    apiKey: env_1.env.GROQ_API_KEY,
});
function formatNullable(value, digits = 2) {
    if (value === null || !Number.isFinite(value))
        return "n/a";
    return value.toFixed(digits);
}
async function askAI(question, market) {
    const evaluation = (0, signal_service_1.evaluateMarketSignal)(market);
    if (!evaluation) {
        return "❌ Не удалось рассчитать deterministic signal по этой паре.";
    }
    const deterministicBlock = {
        pair: evaluation.pair,
        signal: evaluation.signal,
        score: evaluation.score,
        reason: evaluation.reason,
        positives: evaluation.positives,
        negatives: evaluation.negatives,
        metrics: {
            price: evaluation.priceUsd,
            change24h: evaluation.change24h,
            change30d: evaluation.change30d,
            trend30d: evaluation.trend30d,
            rsi14: evaluation.rsi14,
            high30d: evaluation.high30d,
            low30d: evaluation.low30d,
            sma7: evaluation.sma7,
            sma30: evaluation.sma30,
            rangePosition: evaluation.rangePosition,
            pullbackFromHigh: evaluation.pullbackFromHigh,
            totalTvlUsd: market.liquidity.totalTvlUsd,
            socialVolumeTotal: market.sentiment.socialVolumeTotal,
            socialDominanceLatest: market.sentiment.socialDominanceLatest,
        },
    };
    const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        messages: [
            {
                role: "system",
                content: `
Ты SENIOR CRYPTO MARKET ANALYST.
Отвечай только на русском языке.

КРИТИЧЕСКОЕ ПРАВИЛО:
- Сигнал уже рассчитан deterministic engine.
- Ты НЕ имеешь права менять сигнал.
- Ты обязан повторить сигнал ровно таким, каким он передан: BUY / HOLD / SELL.
- Твоя задача: кратко и понятно объяснить готовый сигнал, не споря с ним.

Дополнительные правила:
- Не выдумывай цены и метрики.
- Используй только переданный market context и deterministic signal block.
- Основной горизонт анализа: 1 месяц (30 дней).
- Дополнительно учитывай 24ч только как краткосрочный фон.
- Если данных недостаточно, скажи это прямо.
- Обязательно укажи риски.
        `.trim(),
            },
            {
                role: "user",
                content: `
Вопрос пользователя:
${question}

Deterministic signal block:
${JSON.stringify(deterministicBlock, null, 2)}

Контекст рынка:
${JSON.stringify(market, null, 2)}

Сформируй ответ строго в структуре:

1. Краткий вывод:
- коротко опиши ситуацию за 30 дней

2. Сигнал:
- укажи РОВНО этот сигнал из deterministic signal block без изменений

3. Обоснование:
- цена сейчас
- изменение за 24ч
- изменение за 30д
- тренд за 30д
- RSI
- диапазон high/low за 30д
- score
- ключевые плюсы и минусы из deterministic signal block
- ликвидность и sentiment, если они есть

4. Риски:
- 2-4 коротких пункта

Запрещено:
- менять сигнал
- писать другой BUY/HOLD/SELL, чем в deterministic signal block
- придумывать данные, которых нет
        `.trim(),
            },
        ],
    });
    const content = response.choices[0]?.message?.content?.trim();
    if (content) {
        return content;
    }
    return [
        `1. Краткий вывод:`,
        `За последние 30 дней по паре ${evaluation.pair} наблюдается ${evaluation.trend30d.toLowerCase()} сценарий с mixed-сигналами.`,
        ``,
        `2. Сигнал:`,
        `${evaluation.signal}`,
        ``,
        `3. Обоснование:`,
        `- Цена сейчас: ${evaluation.priceUsd}`,
        `- Изменение за 24ч: ${formatNullable(evaluation.change24h)}%`,
        `- Изменение за 30д: ${formatNullable(evaluation.change30d)}%`,
        `- Тренд за 30д: ${evaluation.trend30d}`,
        `- RSI: ${formatNullable(evaluation.rsi14)}`,
        `- Диапазон high/low за 30д: ${formatNullable(evaluation.high30d, 8)} / ${formatNullable(evaluation.low30d, 8)}`,
        `- Score: ${evaluation.score.toFixed(2)}`,
        `- Ключевая логика: ${evaluation.reason}`,
        ``,
        `4. Риски:`,
        `- Возможна смена краткосрочного импульса.`,
        `- При слабой ликвидности или sentiment точность сигнала снижается.`,
    ].join("\n");
}
//# sourceMappingURL=ai.service.js.map