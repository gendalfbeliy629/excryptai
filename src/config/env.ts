import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string {
  return process.env[name] || "";
}

export const env = {
  TELEGRAM_BOT_TOKEN: requireEnv("TELEGRAM_BOT_TOKEN"),
  GROQ_API_KEY: requireEnv("GROQ_API_KEY"),

  COINCAP_API_KEY: optionalEnv("COINCAP_API_KEY"),
  CRYPTOCOMPARE_API_KEY: optionalEnv("CRYPTOCOMPARE_API_KEY"),
  SANTIMENT_API_KEY: optionalEnv("SANTIMENT_API_KEY"),
};