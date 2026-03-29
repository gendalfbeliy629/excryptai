import express from "express";
import { bot } from "./bot/bot";


async function main() {
const app = express();

app.get("/", (_req, res) => {
  res.send("Crypto AI bot is running 🚀");
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
}

main();
