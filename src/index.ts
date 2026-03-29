import express from "express";
import { bot } from "./bot/bot";

const app = express();

app.get("/", (_req, res) => {
  res.send("Crypto AI bot is running 🚀");
});

const PORT = Number(process.env.PORT) || 3000;

// 🔥 СРАЗУ открываем порт
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// 🔥 бот запускаем отдельно
(async () => {
  try {
    const me = await bot.telegram.getMe();
    console.log(`Bot authorized: @${me.username}`);

    await bot.launch();
    console.log("Telegram bot started");
  } catch (error) {
    console.error("Bot error:", error);
  }
})();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));