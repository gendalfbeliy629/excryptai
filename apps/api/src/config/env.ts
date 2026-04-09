import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

function loadEnvFiles() {
  const cwd = process.cwd();

  const candidatePaths = [
    path.resolve(cwd, ".env.local"),
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "../../.env.local"),
    path.resolve(cwd, "../../.env")
  ];

  const existingPaths = candidatePaths.filter((filePath) => fs.existsSync(filePath));

  if (existingPaths.length > 0) {
    dotenv.config({
      path: existingPaths,
      override: false
    });
  }
}

loadEnvFiles();

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue = ""): string {
  return readEnv(name) ?? defaultValue;
}

function numberEnv(name: string, defaultValue: number): number {
  const raw = readEnv(name);
  if (!raw) return defaultValue;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function booleanEnv(name: string, defaultValue: boolean): boolean {
  const raw = readEnv(name);
  if (!raw) return defaultValue;

  return ["1", "true", "yes", "on"].includes(raw.toLowerCase());
}

export const env = {
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  HOST: optionalEnv("HOST", "0.0.0.0"),
  PORT: numberEnv("PORT", 4000),
  CORS_ORIGIN: optionalEnv("CORS_ORIGIN", "http://localhost:3000"),

  TELEGRAM_BOT_ENABLED: booleanEnv("TELEGRAM_BOT_ENABLED", true),
  TELEGRAM_BOT_TOKEN: optionalEnv("TELEGRAM_BOT_TOKEN"),
  GROQ_API_KEY: requireEnv("GROQ_API_KEY"),

  COINCAP_API_KEY: optionalEnv("COINCAP_API_KEY"),
  CRYPTOCOMPARE_API_KEY: optionalEnv("CRYPTOCOMPARE_API_KEY"),
  SANTIMENT_API_KEY: optionalEnv("SANTIMENT_API_KEY"),

  REDIS_URL: optionalEnv("REDIS_URL"),
  REDIS_ENABLED: booleanEnv("REDIS_ENABLED", true)
};
