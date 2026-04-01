import { Telegraf } from "telegraf";
import { env } from "../config/env";
import { registerStartHandler } from "./handlers/start";
import { registerPriceHandler } from "./handlers/price";
import { registerAIHandler } from "./handlers/ai";
import { registerBuyHandler } from "./handlers/buy";
import { registerInfoHandler } from "./handlers/info";

let botInstance: Telegraf | null = null;

export function getBot(): Telegraf {
  if (botInstance) {
    return botInstance;
  }

  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("Missing required env var: TELEGRAM_BOT_TOKEN");
  }

  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  registerStartHandler(bot);
  registerPriceHandler(bot);
  registerAIHandler(bot);
  registerBuyHandler(bot);
  registerInfoHandler(bot);

  botInstance = bot;
  return botInstance;
}