"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCoinInfo = getCoinInfo;
exports.getTicker = getTicker;
exports.getOHLC = getOHLC;
const axios_1 = __importDefault(require("axios"));
const CG = "https://api.coingecko.com/api/v3";
const BINANCE = "https://api.binance.com";
async function getCoinInfo(coin) {
    const res = await axios_1.default.get(`${CG}/coins/${coin}`);
    return {
        name: res.data.name,
        symbol: res.data.symbol,
        marketCap: res.data.market_data.market_cap.usd,
        price: res.data.market_data.current_price.usd,
        change24h: res.data.market_data.price_change_percentage_24h,
        volume: res.data.market_data.total_volume.usd,
    };
}
async function getTicker(symbol) {
    const res = await axios_1.default.get(`${BINANCE}/api/v3/ticker/price?symbol=${symbol}USDT`);
    return res.data.price;
}
async function getOHLC(symbol, interval = "1h") {
    const res = await axios_1.default.get(`${BINANCE}/api/v3/klines`, {
        params: {
            symbol: `${symbol}USDT`,
            interval,
            limit: 50,
        },
    });
    return res.data.map((c) => ({
        time: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
    }));
}
//# sourceMappingURL=market.service.js.map