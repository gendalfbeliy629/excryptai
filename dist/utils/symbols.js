"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYMBOL_TO_SANTIMENT_SLUG = exports.SYMBOL_TO_DEFILLAMA_SLUGS = exports.SYMBOL_TO_COINCAP_ID = void 0;
exports.normalizeSymbol = normalizeSymbol;
function normalizeSymbol(input) {
    return input.trim().toUpperCase().replace(/USDT$|USD$/i, "");
}
exports.SYMBOL_TO_COINCAP_ID = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    XRP: "xrp",
    BNB: "binance-coin",
    ADA: "cardano",
    DOGE: "dogecoin",
    TON: "toncoin",
    TRX: "tron",
    AVAX: "avalanche",
    SHIB: "shiba-inu",
    PEPE: "pepe",
    LINK: "chainlink",
    DOT: "polkadot",
    LTC: "litecoin",
    BCH: "bitcoin-cash",
    UNI: "uniswap",
    ATOM: "cosmos",
    NEAR: "near-protocol",
    APT: "aptos",
    ARB: "arbitrum",
    OP: "optimism",
    SUI: "sui",
    ETC: "ethereum-classic",
    XLM: "stellar",
    FIL: "filecoin",
    ICP: "internet-computer",
    HBAR: "hedera-hashgraph",
    INJ: "injective-protocol",
};
exports.SYMBOL_TO_DEFILLAMA_SLUGS = {
    BTC: ["wbtc", "tbtc"],
    ETH: ["lido", "aave", "uniswap", "makerdao"],
    SOL: ["jito", "raydium", "marinade"],
    BNB: ["pancakeswap-amm", "venus-core-pool"],
    AVAX: ["aave-v3", "trader-joe-lend"],
    ARB: ["camelot-v3", "radiant-capital"],
    OP: ["velodrome-v2", "aave-v3"],
};
exports.SYMBOL_TO_SANTIMENT_SLUG = {
    BTC: "bitcoin",
    ETH: "ethereum",
    SOL: "solana",
    XRP: "xrp",
    BNB: "binance-coin",
    ADA: "cardano",
    DOGE: "dogecoin",
    TON: "toncoin",
    TRX: "tron",
    AVAX: "avalanche",
    SHIB: "shiba-inu",
    PEPE: "pepe",
    LINK: "chainlink",
    DOT: "polkadot",
    LTC: "litecoin",
    BCH: "bitcoin-cash",
    UNI: "uniswap",
    ATOM: "cosmos",
    NEAR: "near",
    APT: "aptos",
    ARB: "arbitrum",
    OP: "optimism",
    SUI: "sui",
};
//# sourceMappingURL=symbols.js.map