import { Telegraf } from "telegraf";
import { registerStartHandler } from "./start";
import { registerPriceHandler } from "./price";
import { registerAIHandler } from "./ai";
import { registerBuyHandler } from "./buy";

export function registerHandlers(bot: Telegraf) {
  registerStartHandler(bot);
  registerPriceHandler(bot);
  registerAIHandler(bot);
  registerBuyHandler(bot);
}