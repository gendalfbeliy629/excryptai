"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLiquiditySnapshot = getLiquiditySnapshot;
const axios_1 = __importDefault(require("axios"));
const cache_1 = require("../utils/cache");
const symbols_1 = require("../utils/symbols");
const cache = new cache_1.TTLCache();
const TTL_MS = 5 * 60000;
async function getLiquiditySnapshot(symbolInput) {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const cached = cache.get(symbol);
    if (cached)
        return cached;
    const slugs = symbols_1.SYMBOL_TO_DEFILLAMA_SLUGS[symbol];
    if (!slugs || slugs.length === 0) {
        return {
            totalTvlUsd: null,
            protocolsUsed: [],
        };
    }
    let total = 0;
    const used = [];
    await Promise.all(slugs.map(async (slug) => {
        try {
            const response = await axios_1.default.get(`https://api.llama.fi/protocol/${slug}`, {
                timeout: 10000,
            });
            const currentTvl = response.data?.currentChainTvls
                ? Object.values(response.data.currentChainTvls).reduce((sum, value) => sum + Number(value || 0), 0)
                : Number(response.data?.tvl || 0);
            if (Number.isFinite(currentTvl) && currentTvl > 0) {
                total += currentTvl;
                used.push(slug);
            }
        }
        catch {
            // не валим весь ответ из-за одного protocol slug
        }
    }));
    const result = {
        totalTvlUsd: used.length ? total : null,
        protocolsUsed: used,
    };
    cache.set(symbol, result, TTL_MS);
    return result;
}
//# sourceMappingURL=defillama.service.js.map