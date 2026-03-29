"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || "",
    GROQ_API_KEY: process.env.GROQ_API_KEY || "",
    CRYPTO_API_KEY: process.env.CRYPTO_API_KEY || ""
};
//# sourceMappingURL=env.js.map