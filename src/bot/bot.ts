import { Telegraf } from "telegraf";
import { config } from "../config/env";
import { registerStartHandler } from "./handlers/start";
import { registerPriceHandler } from "./handlers/price";
import { registerAIHandler } from "./handlers/ai";

export const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

registerStartHandler(bot);
registerPriceHandler(bot);
registerAIHandler(bot);