import dotenv from "dotenv";

dotenv.config();

export const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
  GROQ_API_KEY: process.env.GROQ_API_KEY || "",
  CRYPTO_API_KEY: process.env.CRYPTO_API_KEY || ""
};
