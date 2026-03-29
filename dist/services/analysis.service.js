"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMarketContext = buildMarketContext;
const market_service_1 = require("./market.service");
const market_service_2 = require("./market.service");
async function buildMarketContext(symbol) {
    const coin = await (0, market_service_1.getCoinInfo)(symbol.toLowerCase());
    const candles = await (0, market_service_2.getOHLC)(symbol);
    const last = candles.slice(-10);
    return `
COIN DATA:
Name: ${coin.name}
Price: ${coin.price}
Market Cap: ${coin.marketCap}
24h Change: ${coin.change24h}%
Volume: ${coin.volume}

LAST 10 CANDLES:
${last.map((c) => `O:${c.open} H:${c.high} L:${c.low} C:${c.close}`).join("\n")}
`;
}
//# sourceMappingURL=analysis.service.js.map