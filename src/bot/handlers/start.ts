import { Context } from 'telegraf';


export const startHandler = async (ctx: Context) => {
  await ctx.reply(`
🚀 Crypto AI Bot

Команды:
/price BTC
/ai По какой цене сегодня нужно покупать и продавать BTC?
`);
}
