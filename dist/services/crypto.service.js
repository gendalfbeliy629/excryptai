"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCryptoPrice = getCryptoPrice;
const axios_1 = __importDefault(require("axios"));
async function getCryptoPrice(symbol) {
    const res = await axios_1.default.get(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}USDT`);
    return res.data.price;
}
//# sourceMappingURL=crypto.service.js.map