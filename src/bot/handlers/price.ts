import { Context } from "telegraf";
import { getCryptoPrice } from "../../services/crypto.service";

export const priceHandler = async (ctx: Context) => {
  try {
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
    const symbol = text.split(" ")[1] || "BTC";

    const price = await getCryptoPrice(symbol.toUpperCase());

    await ctx.reply(`💰 ${symbol.toUpperCase()} = $${price}`);
  } catch (error) {
    console.error(error);
    await ctx.reply("❌ Ошибка получения цены");
  }
};
