import Groq from "groq-sdk";
import { env } from "../config/env";
import { MarketContext } from "./market.service";

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
});

export async function askAI(question: string, market: MarketContext): Promise<string> {
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
- Если данных недостаточно, скажи это прямо.
- Дай четкий итог: BUY / SELL / HOLD.
- Обязательно объясни риски.
        `.trim(),
      },
      {
        role: "user",
        content: `
Вопрос пользователя:
${question}

Контекст рынка:
${JSON.stringify(market, null, 2)}

Сформируй ответ в структуре:
1. Краткий вывод
2. Сигнал: BUY / SELL / HOLD
3. Обоснование
4. Риски
        `.trim(),
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "AI не смог подготовить ответ.";
}