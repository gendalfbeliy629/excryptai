"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.askAI = askAI;
const groq_sdk_1 = __importDefault(require("groq-sdk"));
const env_1 = require("../config/env");
const groq = new groq_sdk_1.default({
    apiKey: env_1.env.GROQ_API_KEY,
});
async function askAI(question, market) {
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
//# sourceMappingURL=ai.service.js.map