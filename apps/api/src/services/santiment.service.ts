import axios from "axios";
import { env } from "../config/env";
import { TTLCache } from "../utils/cache";
import { normalizeSymbol, SYMBOL_TO_SANTIMENT_SLUG } from "../utils/symbols";

export type SentimentSnapshot = {
  socialVolumeTotal: number | null;
  socialDominanceLatest: number | null;
};

const cache = new TTLCache<SentimentSnapshot>();
const TTL_MS = 15 * 60_000;

export async function getSentimentSnapshot(symbolInput: string): Promise<SentimentSnapshot> {
  const symbol = normalizeSymbol(symbolInput);
  const slug = SYMBOL_TO_SANTIMENT_SLUG[symbol];

  if (!slug || !env.SANTIMENT_API_KEY) {
    return {
      socialVolumeTotal: null,
      socialDominanceLatest: null,
    };
  }

  const cached = cache.get(symbol);
  if (cached) return cached;

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

  const response = await axios.post(
    "https://api.santiment.net/graphql",
    {
      query,
      variables: { slug },
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Apikey ${env.SANTIMENT_API_KEY}`,
      },
      timeout: 10000,
    }
  );

  const data = response.data?.data;
  const result: SentimentSnapshot = {
    socialVolumeTotal:
      typeof data?.socialVolume === "number" ? data.socialVolume : null,
    socialDominanceLatest:
      typeof data?.socialDominance === "number" ? data.socialDominance : null,
  };

  cache.set(symbol, result, TTL_MS);
  return result;
}