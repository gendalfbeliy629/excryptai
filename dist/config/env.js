"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function requireEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required env var: ${name}`);
    }
    return value;
}
function optionalEnv(name) {
    return process.env[name] || "";
}
exports.env = {
    TELEGRAM_BOT_TOKEN: requireEnv("TELEGRAM_BOT_TOKEN"),
    GROQ_API_KEY: requireEnv("GROQ_API_KEY"),
    COINCAP_API_KEY: optionalEnv("COINCAP_API_KEY"),
    CRYPTOCOMPARE_API_KEY: optionalEnv("CRYPTOCOMPARE_API_KEY"),
    SANTIMENT_API_KEY: optionalEnv("SANTIMENT_API_KEY"),
};
//# sourceMappingURL=env.js.map