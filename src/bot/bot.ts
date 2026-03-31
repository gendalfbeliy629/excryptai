import { Telegraf } from "telegraf";
import { env } from "../config/env";
import { registerStartHandler } from "./handlers/start";
import { registerPriceHandler } from "./handlers/price";
import { registerAIHandler } from "./handlers/ai";
import { registerBuyHandler } from "./handlers/buy";
import { registerInfoHandler } from "./handlers/info";

export const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

registerStartHandler(bot);
registerPriceHandler(bot);
registerAIHandler(bot);
registerBuyHandler(bot);
registerInfoHandler(bot);