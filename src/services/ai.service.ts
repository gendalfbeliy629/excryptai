import Groq from "groq-sdk";
import { env } from "../config/env";
import { MarketContext } from "./market.service";

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
});

export async function askAI(
  question: string,
  market: MarketContext
): Promise<string> {
  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: `
Ты SENIOR CRYPTO MARKET ANALYST.
Отвечай только на русском языке.

Правила:
- Не выдумывай цены и метрики.
- Используй только переданный market context.
- Основной горизонт анализа: 1 месяц (30 дней).
- Дополнительно можешь учитывать изменение за 24 часа как краткосрочный фон.
- Если данных недостаточно, скажи это прямо.
- Дай четкий итог: BUY / SELL / HOLD.
- Обязательно объясни риски.
- Не пиши про "последние 24 часа" как про главный период анализа, если есть данные за 30 дней.
        `.trim(),
      },
      {
        role: "user",
        content: `
Вопрос пользователя:
${question}

Контекст рынка:
${JSON.stringify(market, null, 2)}

Сформируй ответ строго в структуре:

1. Краткий вывод:
- коротко опиши ситуацию за 30 дней

2. Сигнал:
- BUY / SELL / HOLD

3. Обоснование:
- цена сейчас
- изменение за 24ч
- изменение за 30д
- тренд за 30д
- RSI
- диапазон high/low за 30д
- ликвидность и sentiment, если они есть

4. Риски:
- 2-4 коротких пункта

Важно:
- Если 30-дневный тренд боковой или данные неоднозначны, чаще выбирай HOLD.
- Если RSI нейтральный, не делай агрессивный BUY/SELL без сильного тренда.
        `.trim(),
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "AI не смог подготовить ответ.";
}