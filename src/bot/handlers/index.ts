import { Telegraf } from "telegraf";
import { registerStartHandler } from "./start";
import { registerPriceHandler } from "./price";
import { registerAIHandler } from "./ai";

export function registerHandlers(bot: Telegraf) {
  registerStartHandler(bot);
  registerPriceHandler(bot);
  registerAIHandler(bot);
}