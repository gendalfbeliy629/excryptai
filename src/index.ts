import { bot } from "./bot/bot";

async function main() {
  await bot.launch();
  console.log('🤖 Bot started');
}

main();
