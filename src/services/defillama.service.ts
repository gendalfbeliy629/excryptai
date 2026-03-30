import axios from "axios";
import { TTLCache } from "../utils/cache";
import { normalizeSymbol, SYMBOL_TO_DEFILLAMA_SLUGS } from "../utils/symbols";

export type LiquiditySnapshot = {
  totalTvlUsd: number | null;
  protocolsUsed: string[];
};

const cache = new TTLCache<LiquiditySnapshot>();
const TTL_MS = 5 * 60_000;

export async function getLiquiditySnapshot(symbolInput: string): Promise<LiquiditySnapshot> {
  const symbol = normalizeSymbol(symbolInput);
  const cached = cache.get(symbol);
  if (cached) return cached;

  const slugs = SYMBOL_TO_DEFILLAMA_SLUGS[symbol];
  if (!slugs || slugs.length === 0) {
    return {
      totalTvlUsd: null,
      protocolsUsed: [],
    };
  }

  let total = 0;
  const used: string[] = [];

  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const response = await axios.get(`https://api.llama.fi/protocol/${slug}`, {
          timeout: 10000,
        });

        const currentTvl = response.data?.currentChainTvls
          ? Object.values(response.data.currentChainTvls).reduce(
              (sum: number, value: any) => sum + Number(value || 0),
              0
            )
          : Number(response.data?.tvl || 0);

        if (Number.isFinite(currentTvl) && currentTvl > 0) {
          total += currentTvl;
          used.push(slug);
        }
      } catch {
        // не валим весь ответ из-за одного protocol slug
      }
    })
  );

  const result: LiquiditySnapshot = {
    totalTvlUsd: used.length ? total : null,
    protocolsUsed: used,
  };

  cache.set(symbol, result, TTL_MS);
  return result;
}