"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSentimentSnapshot = getSentimentSnapshot;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
const cache_1 = require("../utils/cache");
const symbols_1 = require("../utils/symbols");
const cache = new cache_1.TTLCache();
const TTL_MS = 15 * 60000;
async function getSentimentSnapshot(symbolInput) {
    const symbol = (0, symbols_1.normalizeSymbol)(symbolInput);
    const slug = symbols_1.SYMBOL_TO_SANTIMENT_SLUG[symbol];
    if (!slug || !env_1.env.SANTIMENT_API_KEY) {
        return {
            socialVolumeTotal: null,
            socialDominanceLatest: null,
        };
    }
    const cached = cache.get(symbol);
    if (cached)
        return cached;
    const query = `
    query GetSantimentMetrics($slug: String!) {
      socialVolume: getMetric(metric: "social_volume_total") {
        aggregatedTimeseriesData(
          slug: $slug
          from: "utc_now-1d"
          to: "utc_now"
          aggregation: LAST
        )
      }
      socialDominance: getMetric(metric: "social_dominance_total") {
        aggregatedTimeseriesData(
          slug: $slug
          from: "utc_now-1d"
          to: "utc_now"
          aggregation: LAST
        )
      }
    }
  `;
    const response = await axios_1.default.post("https://api.santiment.net/graphql", {
        query,
        variables: { slug },
    }, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Apikey ${env_1.env.SANTIMENT_API_KEY}`,
        },
        timeout: 10000,
    });
    const data = response.data?.data;
    const result = {
        socialVolumeTotal: typeof data?.socialVolume === "number" ? data.socialVolume : null,
        socialDominanceLatest: typeof data?.socialDominance === "number" ? data.socialDominance : null,
    };
    cache.set(symbol, result, TTL_MS);
    return result;
}
//# sourceMappingURL=santiment.service.js.map