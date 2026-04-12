import Groq from "groq-sdk";
import { env } from "../config/env";
import { MarketContext } from "./market.service";
import { evaluateMarketSignal } from "./signal.service";

const groq = new Groq({
  apiKey: env.GROQ_API_KEY
});

function formatNullable(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return value.toFixed(digits);
}

function buildCompactMarketSnapshot(market: MarketContext) {
  return {
    asset: {
      symbol: market.asset.symbol,
      name: market.asset.name
    },
    pair: market.pair.display,
    exchange: market.pair.exchange,
    spot: {
      price: market.spot.price,
      priceUsd: market.spot.priceUsd,
      change24h: market.spot.change24h,
      marketCapUsd: market.spot.marketCapUsd
    },
    technicals30d: {
      high30d: market.technicals.high30d,
      low30d: market.technicals.low30d,
      change30d: market.technicals.change30d,
      trend30d: market.technicals.trend30d,
      rsi14: market.technicals.rsi14,
      sma7: market.technicals.sma7,
      sma30: market.technicals.sma30,
      ema20: market.technicals.ema20,
      ema50: market.technicals.ema50,
      macdLine: market.technicals.macdLine,
      macdSignal: market.technicals.macdSignal,
      macdHistogram: market.technicals.macdHistogram
    },
    structure: {
      nearestResistance: market.technicals.structure.nearestResistance,
      nextResistance: market.technicals.structure.nextResistance,
      nearestSupport: market.technicals.structure.nearestSupport,
      roomToResistancePercent: market.technicals.structure.roomToResistancePercent
    },
    intraday1h: {
      rsi14: market.technicals.intraday1h.rsi14,
      ema20: market.technicals.intraday1h.ema20,
      ema50: market.technicals.intraday1h.ema50,
      atr14: market.technicals.intraday1h.atr14,
      macdLine: market.technicals.intraday1h.macdLine,
      macdSignal: market.technicals.intraday1h.macdSignal,
      macdHistogram: market.technicals.intraday1h.macdHistogram,
      recentSwingHigh: market.technicals.intraday1h.recentSwingHigh,
      recentSwingLow: market.technicals.intraday1h.recentSwingLow
    },
    execution: {
      bestBid: market.execution.bestBid,
      bestAsk: market.execution.bestAsk,
      spreadPercent: market.execution.spreadPercent,
      orderBookImbalance: market.execution.orderBookImbalance
    },
    liquidity: {
      totalTvlUsd: market.liquidity.totalTvlUsd,
      protocolsUsed: market.liquidity.protocolsUsed
    },
    sentiment: {
      socialVolumeTotal: market.sentiment.socialVolumeTotal,
      socialDominanceLatest: market.sentiment.socialDominanceLatest
    }
  };
}

export async function askAI(
  question: string,
  market: MarketContext
): Promise<string> {
  const evaluation = evaluateMarketSignal(market);

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
      atr1hPercent: evaluation.atr1hPercent,
      nearestResistance: evaluation.nearestResistance,
      nearestSupport: evaluation.nearestSupport,
      entryConfirmationText: evaluation.entryConfirmationText
    }
  };

  const compactMarketSnapshot = buildCompactMarketSnapshot(market);

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `
Ты SENIOR CRYPTO TRADING ANALYST.
Отвечай только на русском языке.

КРИТИЧЕСКОЕ ПРАВИЛО:
- Сигнал уже рассчитан deterministic engine.
- Ты НЕ имеешь права менять сигнал.
- Ты обязан повторить сигнал ровно таким, каким он передан: BUY / HOLD / SELL.
- Твоя задача: ответить на вопрос пользователя именно в контексте криптотрейдинга и кратко объяснить готовый сигнал, не споря с ним.

Дополнительные правила:
- Не выдумывай цены и метрики.
- Используй только переданный compact market snapshot и deterministic signal block.
- Основной горизонт анализа: 1 месяц (30 дней), если пользователь не просит иной акцент.
- 24ч используй как краткосрочный фон для трейдера.
- Если пользователь спрашивает про вход, отдельно скажи: что за сценарий сейчас, где риск, что должно подтвердиться.
- Если пользователь спрашивает про удержание или продажу, отвечай как трейдер, а не как инвестор.
- Если данных недостаточно, скажи это прямо.
- Обязательно укажи риски.
- Ответ должен быть компактным, практичным и без длинных вводных.
        `.trim()
      },
      {
        role: "user",
        content: `
Вопрос пользователя:
${question}

Deterministic signal block:
${JSON.stringify(deterministicBlock)}

Compact market snapshot:
${JSON.stringify(compactMarketSnapshot)}

Сформируй ответ строго в структуре:

1. Краткий вывод
2. Сигнал
3. Трейдерский контекст
4. Обоснование
5. Риски

В разделе "Трейдерский контекст" коротко ответь, что это означает для трейдера прямо сейчас.
В разделе "Обоснование" используй только:
- цену сейчас
- изменение за 24ч
- изменение за 30д
- тренд за 30д
- RSI
- high/low за 30д
- score
- ключевые плюсы и минусы
- ликвидность и sentiment, если они есть
- уровни / подтверждение входа, если они есть

Запрещено:
- менять сигнал
- писать другой BUY/HOLD/SELL, чем в deterministic signal block
- придумывать данные, которых нет
        `.trim()
      }
    ]
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
    `3. Трейдерский контекст:`,
    `Текущий сценарий нужно оценивать именно как решение для криптотрейдинга по готовому deterministic signal, а не как долгосрочную инвестиционную рекомендацию.`,
    ``,
    `4. Обоснование:`,
    `- Цена сейчас: ${evaluation.priceUsd}`,
    `- Изменение за 24ч: ${formatNullable(evaluation.change24h)}%`,
    `- Изменение за 30д: ${formatNullable(evaluation.change30d)}%`,
    `- Тренд за 30д: ${evaluation.trend30d}`,
    `- RSI: ${formatNullable(evaluation.rsi14)}`,
    `- Диапазон high/low за 30д: ${formatNullable(evaluation.high30d, 8)} / ${formatNullable(evaluation.low30d, 8)}`,
    `- Score: ${evaluation.score.toFixed(2)}`,
    `- Ключевая логика: ${evaluation.reason}`,
    ``,
    `5. Риски:`,
    `- Возможна смена краткосрочного импульса.`,
    `- При слабой ликвидности или sentiment точность сигнала снижается.`
  ].join("\n");
}