import axios from "axios";
import Groq from "groq-sdk";
import { env } from "../config/env";
import { normalizeSymbol } from "../utils/symbols";

type CoinSearchResult = {
  id: string;
  name: string;
  symbol: string;
};

type WalletInfo = {
  official: string[];
  unofficial: string[];
};

type SupplementalAssetInfo = {
  blockchainSize?: string;
  blockReward?: string;
  halving?: string;
  consensusType?: string;
};

type CoinGeckoTicker = {
  market?: { name?: string };
  base?: string;
  target?: string;
  trade_url?: string | null;
  last?: number | null;
  trust_score?: string | null;
};

type CoinGeckoDetails = {
  id: string;
  symbol: string;
  name: string;
  hashing_algorithm?: string | null;
  genesis_date?: string | null;
  block_time_in_minutes?: number | null;
  categories?: string[];
  description?: Record<string, string>;
  links?: {
    homepage?: string[];
    blockchain_site?: string[];
    repos_url?: { github?: string[] };
    official_forum_url?: string[];
    chat_url?: string[];
    subreddit_url?: string | null;
  };
  market_cap_rank?: number | null;
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
    ath?: { usd?: number };
    ath_date?: { usd?: string };
    atl?: { usd?: number };
    atl_date?: { usd?: string };
    price_change_percentage_24h?: number | null;
  };
  tickers?: CoinGeckoTicker[];
  community_data?: {
    twitter_followers?: number | null;
    reddit_subscribers?: number | null;
    telegram_channel_user_count?: number | null;
  };
  developer_data?: {
    forks?: number | null;
    stars?: number | null;
    subscribers?: number | null;
    total_issues?: number | null;
    closed_issues?: number | null;
    pull_requests_merged?: number | null;
    commit_count_4_weeks?: number | null;
  };
  sentiment_votes_up_percentage?: number | null;
  sentiment_votes_down_percentage?: number | null;
  public_interest_score?: number | null;
};

const groq = new Groq({
  apiKey: env.GROQ_API_KEY,
});

const OFFICIAL_WALLETS: Record<string, WalletInfo> = {
  BTC: {
    official: ["Bitcoin Core"],
    unofficial: ["Electrum", "BlueWallet", "Trust Wallet", "Ledger", "Trezor"],
  },
  ETH: {
    official: ["Ethereum Foundation не выпускает единый официальный кошелёк"],
    unofficial: ["MetaMask", "Rabby", "Trust Wallet", "Ledger", "Trezor"],
  },
  SOL: {
    official: ["Solflare (широко считается нативным кошельком экосистемы)"],
    unofficial: ["Phantom", "Backpack", "Trust Wallet", "Ledger"],
  },
  XRP: {
    official: ["Xaman (бывший Xumm, де-факто основной кошелёк экосистемы XRPL)"],
    unofficial: ["Trust Wallet", "Ledger", "Trezor"],
  },
  ADA: {
    official: ["Lace"],
    unofficial: ["Daedalus", "Yoroi", "Eternl", "Ledger", "Trezor"],
  },
  DOGE: {
    official: ["Dogecoin Core"],
    unofficial: ["Trust Wallet", "Ledger", "Trezor", "Coinomi"],
  },
  LTC: {
    official: ["Litecoin Core"],
    unofficial: ["Electrum-LTC", "Trust Wallet", "Ledger", "Trezor"],
  },
  TON: {
    official: ["TON Space", "Tonkeeper (наиболее распространён в экосистеме)"],
    unofficial: ["MyTonWallet", "Ledger"],
  },
  TRX: {
    official: ["TronLink"],
    unofficial: ["Trust Wallet", "Ledger"],
  },
  BNB: {
    official: ["BNB Chain Wallet / Binance Wallet"],
    unofficial: ["MetaMask", "Trust Wallet", "Ledger", "Trezor"],
  },
};

const SUPPLEMENTAL_ASSET_INFO: Record<string, SupplementalAssetInfo> = {
  BTC: {
    blockchainSize:
      "нет надёжных универсальных данных в используемом источнике; размер полной ноды зависит от клиента и режима хранения",
    blockReward: "3.125 BTC за блок",
    halving: "да, примерно каждые 210 000 блоков",
    consensusType: "Proof-of-Work (PoW)",
  },
  LTC: {
    blockchainSize:
      "нет надёжных универсальных данных в используемом источнике; зависит от клиента и режима хранения",
    blockReward: "6.25 LTC за блок",
    halving: "да, примерно каждые 840 000 блоков",
    consensusType: "Proof-of-Work (PoW)",
  },
  DOGE: {
    blockchainSize:
      "нет надёжных универсальных данных в используемом источнике; зависит от клиента и режима хранения",
    blockReward: "10 000 DOGE за блок",
    halving: "нет, фиксированная награда без классического халвинга",
    consensusType: "Proof-of-Work (PoW)",
  },
  BCH: {
    blockchainSize:
      "нет надёжных универсальных данных в используемом источнике; зависит от клиента и режима хранения",
    blockReward: "3.125 BCH за блок",
    halving: "да, примерно каждые 210 000 блоков",
    consensusType: "Proof-of-Work (PoW)",
  },
  ETC: {
    blockchainSize:
      "нет надёжных универсальных данных в используемом источнике; зависит от клиента и режима хранения",
    blockReward: "зависит от текущей эпохи сети",
    halving:
      "есть периодическое снижение награды по модели сети, но не классический bitcoin-halving",
    consensusType: "Proof-of-Work (PoW)",
  },
  ETH: {
    blockchainSize: "нет надёжных данных",
    blockReward: "после перехода на PoS классическая награда за блок в прежнем виде не применяется",
    halving: "нет",
    consensusType: "Proof-of-Stake (PoS)",
  },
  SOL: {
    blockchainSize: "нет надёжных данных",
    blockReward: "награды распределяются через механизм валидаторов и инфляционную модель сети",
    halving: "нет",
    consensusType: "Proof-of-Stake (PoS) + Proof-of-History (PoH)",
  },
  ADA: {
    blockchainSize: "нет надёжных данных",
    blockReward: "награды распределяются через staking",
    halving: "нет",
    consensusType: "Proof-of-Stake (Ouroboros)",
  },
  XRP: {
    blockchainSize: "нет надёжных данных",
    blockReward: "майнинга и классической награды за блок нет",
    halving: "нет",
    consensusType: "XRPL Consensus Protocol",
  },
  TRX: {
    blockchainSize: "нет надёжных данных",
    blockReward: "награды распределяются между супер-представителями/валидаторами",
    halving: "нет",
    consensusType: "Delegated Proof-of-Stake (DPoS)",
  },
  TON: {
    blockchainSize: "нет надёжных данных",
    blockReward: "награды распределяются через валидаторов и staking-механику сети",
    halving: "нет",
    consensusType: "Proof-of-Stake (PoS)",
  },
  BNB: {
    blockchainSize: "нет надёжных данных",
    blockReward: "зависит от сети и модели валидаторов; классического майнинга нет",
    halving: "нет, вместо этого применяется механизм сжигания",
    consensusType: "Proof-of-Staked-Authority (PoSA)",
  },
};

function compactText(input: string, maxLength = 6000): string {
  const cleaned = input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength)}...`;
}

function formatUsd(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "n/a";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${value.toFixed(2)}`;
  if (value >= 1) return `$${value.toFixed(4)}`;
  return `$${value.toFixed(8)}`;
}

function formatNumber(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "нет надёжных данных";
  }

  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value);
}

function formatPercent(value?: number | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "нет надёжных данных";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatBlockTime(minutes?: number | null): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return "нет надёжных данных";
  }

  if (minutes >= 1) {
    return `${minutes.toFixed(minutes >= 10 ? 0 : 2)} мин`;
  }

  const seconds = minutes * 60;
  return `${seconds.toFixed(seconds >= 10 ? 0 : 2)} сек`;
}

function dedupeStrings(values: Array<string | null | undefined>, limit = 8): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = String(value || "").trim();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);

    if (result.length >= limit) break;
  }

  return result;
}

function buildMiningInfo(details: CoinGeckoDetails, symbol: string): string {
  const categories = (details.categories || []).join(", ").toLowerCase();
  const hashing = details.hashing_algorithm?.trim();
  const supplemental = SUPPLEMENTAL_ASSET_INFO[symbol];

  if (supplemental?.consensusType) {
    if (categories.includes("mineable") || hashing) {
      return `Обычно добывается через майнинг.`;
    }

    return `Сеть работает через ${supplemental.consensusType}. Классический майнинг может отсутствовать.`;
  }

  if (categories.includes("mineable") || hashing) {
    return `Обычно добывается через майнинг${hashing ? `, алгоритм: ${hashing}` : ""}.`;
  }

  if (categories.includes("staking") || categories.includes("proof-of-stake")) {
    return "Как правило, не майнится. Сеть обычно работает через staking / валидаторов.";
  }

  return "Нужно уточнять по конкретной сети: для части активов используется майнинг, для части — валидаторы, а токены могут вообще не иметь собственной добычи.";
}

function getSupplementalInfo(symbol: string): SupplementalAssetInfo {
  return (
    SUPPLEMENTAL_ASSET_INFO[symbol] || {
      blockchainSize: "нет надёжных данных",
      blockReward: "нет надёжных данных",
      halving: "нет надёжных данных",
      consensusType: "нет надёжных данных",
    }
  );
}

async function searchCoin(query: string): Promise<CoinSearchResult> {
  const normalized = normalizeSymbol(query);

  const response = await axios.get("https://api.coingecko.com/api/v3/search", {
    params: { query: normalized },
    timeout: 15000,
  });

  const coins = Array.isArray(response.data?.coins) ? response.data.coins : [];
  const exact =
    coins.find((item: any) => String(item.symbol || "").toUpperCase() === normalized) ||
    coins[0];

  if (!exact?.id) {
    throw new Error(`Coin not found: ${query}`);
  }

  return {
    id: String(exact.id),
    name: String(exact.name || normalized),
    symbol: String(exact.symbol || normalized).toUpperCase(),
  };
}

async function getCoinDetails(query: string): Promise<CoinGeckoDetails> {
  const found = await searchCoin(query);

  const response = await axios.get(`https://api.coingecko.com/api/v3/coins/${found.id}`, {
    params: {
      localization: false,
      tickers: true,
      market_data: true,
      community_data: true,
      developer_data: true,
      sparkline: false,
    },
    timeout: 20000,
  });

  return response.data as CoinGeckoDetails;
}

export async function getAssetInfo(symbolOrPair: string): Promise<string> {
  const normalizedInput = normalizeSymbol(symbolOrPair.split("/")[0] || symbolOrPair);
  const details = await getCoinDetails(normalizedInput);
  const symbol = String(details.symbol || normalizedInput).toUpperCase();
  const supplemental = getSupplementalInfo(symbol);

  const wallets = OFFICIAL_WALLETS[symbol] || {
    official: ["У проекта нет единого общепризнанного официального кошелька или он неочевиден."],
    unofficial: [
      "Trust Wallet",
      "Ledger",
      "Trezor",
      "MetaMask / Rabby — если актив совместим с EVM",
    ],
  };

  const exchanges = dedupeStrings(
    (details.tickers || []).map((ticker) => {
      const marketName = ticker.market?.name?.trim();
      if (!marketName) return null;

      const pair = [ticker.base, ticker.target].filter(Boolean).join("/");
      return pair ? `${marketName} (${pair})` : marketName;
    }),
    10
  );

  const description = compactText(
    details.description?.ru || details.description?.en || "Описание в источнике отсутствует.",
    4500
  );

  const homepage = dedupeStrings(details.links?.homepage || [], 3);
  const blockchainSites = dedupeStrings(details.links?.blockchain_site || [], 4);
  const repos = dedupeStrings(details.links?.repos_url?.github || [], 3);
  const categories = dedupeStrings(details.categories || [], 10);
  const forumLinks = dedupeStrings(details.links?.official_forum_url || [], 2);
  const chatLinks = dedupeStrings(details.links?.chat_url || [], 2);

  const promptPayload = {
    asset: {
      name: details.name,
      symbol,
      id: details.id,
      marketCapRank: details.market_cap_rank ?? null,
      genesisDate: details.genesis_date ?? null,
      hashingAlgorithm: details.hashing_algorithm ?? null,
      blockTimeMinutes: details.block_time_in_minutes ?? null,
      categories,
      currentPriceUsd: details.market_data?.current_price?.usd ?? null,
      marketCapUsd: details.market_data?.market_cap?.usd ?? null,
      volume24hUsd: details.market_data?.total_volume?.usd ?? null,
      circulatingSupply: details.market_data?.circulating_supply ?? null,
      totalSupply: details.market_data?.total_supply ?? null,
      maxSupply: details.market_data?.max_supply ?? null,
      athUsd: details.market_data?.ath?.usd ?? null,
      athDate: details.market_data?.ath_date?.usd ?? null,
      atlUsd: details.market_data?.atl?.usd ?? null,
      atlDate: details.market_data?.atl_date?.usd ?? null,
      priceChange24h: details.market_data?.price_change_percentage_24h ?? null,
      sentimentUp: details.sentiment_votes_up_percentage ?? null,
      sentimentDown: details.sentiment_votes_down_percentage ?? null,
      publicInterestScore: details.public_interest_score ?? null,
    },
    networkMetrics: {
      blockchainSize: supplemental.blockchainSize || "нет надёжных данных",
      blockReward: supplemental.blockReward || "нет надёжных данных",
      halving: supplemental.halving || "нет надёжных данных",
      consensusType: supplemental.consensusType || "нет надёжных данных",
      miningInfo: buildMiningInfo(details, symbol),
    },
    discoveryAndUsage: {
      description,
      officialWallets: wallets.official,
      unofficialWallets: wallets.unofficial,
      exchanges,
      homepage,
      blockchainSites,
      githubRepos: repos,
      forumLinks,
      chatLinks,
      subreddit: details.links?.subreddit_url || null,
    },
    community: {
      twitterFollowers: details.community_data?.twitter_followers ?? null,
      redditSubscribers: details.community_data?.reddit_subscribers ?? null,
      telegramUsers: details.community_data?.telegram_channel_user_count ?? null,
    },
    development: {
      forks: details.developer_data?.forks ?? null,
      stars: details.developer_data?.stars ?? null,
      subscribers: details.developer_data?.subscribers ?? null,
      totalIssues: details.developer_data?.total_issues ?? null,
      closedIssues: details.developer_data?.closed_issues ?? null,
      mergedPRs: details.developer_data?.pull_requests_merged ?? null,
      commits4Weeks: details.developer_data?.commit_count_4_weeks ?? null,
    },
    preformatted: {
      currentPriceUsd: formatUsd(details.market_data?.current_price?.usd),
      marketCapUsd: formatUsd(details.market_data?.market_cap?.usd),
      volume24hUsd: formatUsd(details.market_data?.total_volume?.usd),
      circulatingSupply: formatNumber(details.market_data?.circulating_supply),
      totalSupply: formatNumber(details.market_data?.total_supply),
      maxSupply: formatNumber(details.market_data?.max_supply),
      change24h: formatPercent(details.market_data?.price_change_percentage_24h),
      blockTime: formatBlockTime(details.block_time_in_minutes),
      hashingAlgorithm: details.hashing_algorithm || "нет надёжных данных",
      blockReward: supplemental.blockReward || "нет надёжных данных",
      halving: supplemental.halving || "нет надёжных данных",
      blockchainSize: supplemental.blockchainSize || "нет надёжных данных",
      consensusType: supplemental.consensusType || "нет надёжных данных",
      miningInfo: buildMiningInfo(details, symbol),
      communityTwitter: formatNumber(details.community_data?.twitter_followers),
      communityReddit: formatNumber(details.community_data?.reddit_subscribers),
      communityTelegram: formatNumber(details.community_data?.telegram_channel_user_count),
      stars: formatNumber(details.developer_data?.stars),
      forks: formatNumber(details.developer_data?.forks),
      commits4Weeks: formatNumber(details.developer_data?.commit_count_4_weeks),
    },
  };

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `
Ты senior crypto research analyst.
Отвечай только на русском языке.
Не выдумывай факты, используй только данные из JSON.
Если параметр неизвестен или null, пиши: "нет надёжных данных".
Если размер блокчейна, награда за блок или халвинг не подтверждены в данных, так и пиши.
Если актив не майнится, не называй его майнинговой монетой.
Сделай ответ компактным, но информативным.
        `.trim(),
      },
      {
        role: "user",
        content: `
Подготовь карточку по криптовалюте в строгой структуре:

🔹 <название> (<тикер>)

1. История создания и цель
2. Ключевые характеристики
- как добывается
- алгоритм / тип сети
- алгоритм хеширования
- дата запуска
- время формирования блока
- circulating supply
- total supply
- максимальная эмиссия
- market cap rank
- капитализация
- цена
- изменение 24ч
- volume 24h
- размер блокчейна
- текущая награда за блок
- халвинг
- ATH / ATL

3. Кошельки
- официальные
- неофициальные / популярные

4. Где купить
5. Где и как применяется
6. Плюсы
7. Минусы
8. Текущий статус развития
9. Дополнительно
- сообщество
- github / разработка
- официальный сайт / explorer / repo

Требования:
- удали отдельный пункт "Как добывается / как обеспечивается работа сети"
- поле "Как добывается" должно быть только внутри пункта 2 "Ключевые характеристики"
- все поля: "Максимальная эмиссия", "Алгоритм хеширования", "Время формирования блока", "Текущая награда за блок", "Халвинг", "Капитализация" должны находиться именно в пункте 2 "Ключевые характеристики"
- пиши кратко, по делу, в виде маркированных пунктов
- не делай слишком длинные абзацы
- если по награде за блок, халвингу или размеру блокчейна нет надёжных данных, так и напиши
- в разделе "Где купить" перечисли конкретные биржи/рынки из данных
- в статусе развития сделай вывод по developer/community metrics, но только на основе предоставленных цифр

JSON:
${JSON.stringify(promptPayload, null, 2)}
        `.trim(),
      },
    ],
  });

  const content = response.choices[0]?.message?.content?.trim();

  if (content) {
    return content;
  }

  return [
    `🔹 ${details.name} (${symbol})`,
    "",
    "1. История создания и цель",
    `- ${description.slice(0, 700) || "нет надёжных данных"}`,
    "",
    "2. Ключевые характеристики",
    `- Как добывается: ${buildMiningInfo(details, symbol)}`,
    `- Алгоритм / тип сети: ${supplemental.consensusType || "нет надёжных данных"}`,
    `- Алгоритм хеширования: ${details.hashing_algorithm || "нет надёжных данных"}`,
    `- Дата запуска: ${details.genesis_date || "нет надёжных данных"}`,
    `- Время формирования блока: ${formatBlockTime(details.block_time_in_minutes)}`,
    `- Circulating Supply: ${formatNumber(details.market_data?.circulating_supply)}`,
    `- Total Supply: ${formatNumber(details.market_data?.total_supply)}`,
    `- Максимальная эмиссия: ${formatNumber(details.market_data?.max_supply)}`,
    `- Market Cap Rank: ${details.market_cap_rank ?? "нет надёжных данных"}`,
    `- Капитализация: ${formatUsd(details.market_data?.market_cap?.usd)}`,
    `- Цена: ${formatUsd(details.market_data?.current_price?.usd)}`,
    `- Изменение 24ч: ${formatPercent(details.market_data?.price_change_percentage_24h)}`,
    `- Volume 24h: ${formatUsd(details.market_data?.total_volume?.usd)}`,
    `- Размер блокчейна: ${supplemental.blockchainSize || "нет надёжных данных"}`,
    `- Текущая награда за блок: ${supplemental.blockReward || "нет надёжных данных"}`,
    `- Халвинг: ${supplemental.halving || "нет надёжных данных"}`,
    `- ATH: ${formatUsd(details.market_data?.ath?.usd)} (${details.market_data?.ath_date?.usd || "нет надёжных данных"})`,
    `- ATL: ${formatUsd(details.market_data?.atl?.usd)} (${details.market_data?.atl_date?.usd || "нет надёжных данных"})`,
    "",
    "3. Кошельки",
    `- Официальные: ${wallets.official.join(", ")}`,
    `- Популярные: ${wallets.unofficial.join(", ")}`,
    "",
    "4. Где купить",
    `- ${exchanges.join(", ") || "нет надёжных данных"}`,
  ].join("\n");
}