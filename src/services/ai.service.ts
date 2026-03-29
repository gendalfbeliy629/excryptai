import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

type MarketData = {
  symbol: string;
  price: number;
};

export const askAI = async (
  message: string,
  market?: MarketData
) => {
  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `
You are a SENIOR CRYPTO MARKET ANALYST.

IMPORTANT LANGUAGE RULE:
- Always respond ONLY in Russian language
- Never use English unless user explicitly requests it

Rules:
- Use real market data if provided
- Never guess prices
- Focus on technical analysis
- Give clear signal: BUY / SELL / HOLD
- Explain risk in 1-2 lines
- No hype, no speculation without data
- Be precise, structured, and professional
          `,
        },
        {
          role: "user",
          content: `
Answer ONLY in Russian language.

Market Data:
- Symbol: ${market?.symbol || "UNKNOWN"}
- Current Price: ${market?.price ?? "NO DATA"}

User Question:
${message}

Provide trading analysis in Russian.
          `,
        },
      ],
    });

    return response.choices[0]?.message?.content || "Нет ответа";
  } catch (error) {
    console.error(error);
    return "❌ AI ошибка";
  }
};