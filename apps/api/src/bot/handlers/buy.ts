import { Telegraf } from "telegraf";
import {
  BuyCandidate,
  FailedMarketDetail,
  RejectionBreakdownItem,
  getBuyScanResult
} from "../../services/buy.service";
import { BuyScanMode } from "../../services/signal.service";
import {
  getSharedBuyScanResult,
  getSharedBuyScanStatus,
  setSharedBuyScanResult
} from "../../utils/buy-cache";

import { buildBuyCommandMessage, formatCacheTime } from "../../utils/buy-message";

function parseBuyMode(text: string): BuyScanMode {
  const normalized = text.trim().toLowerCase();
  const parts = normalized.split(/\s+/).filter(Boolean);
  const rawMode = (parts[1] || "soft").split("@")[0];

  if (rawMode === "hard") return "hard";
  return "soft";
}

export function registerBuyHandler(bot: Telegraf) {
  bot.command("buy", async (ctx) => {
    try {
      const text = "text" in ctx.message ? ctx.message.text : "/buy";
      const mode = parseBuyMode(text);

      await ctx.reply(
        mode === "soft"
          ? "Открываю данные из кеша BUY-сигналов или, если кеша для soft нет, запускаю мягкий scan Pionex..."
          : "Открываю данные из кеша BUY-сигналов или, если кеша для hard нет, запускаю hard scan Pionex..."
      );

      const cached = getSharedBuyScanResult(10, mode);
      const result = cached ?? (await getBuyScanResult(10, mode));

      if (!cached) {
        setSharedBuyScanResult(result);
      }

      const cacheStatus = getSharedBuyScanStatus(mode);
      const cacheUpdatedAt = formatCacheTime(cacheStatus.warmedAt ?? new Date().toISOString());
      const message = buildBuyCommandMessage(result, mode, cacheUpdatedAt);

      await ctx.reply(message);
    } catch (error) {
      console.error("Buy handler error:", error);
      await ctx.reply("❌ Ошибка при расчёте команды /buy.");
    }
  });
}
