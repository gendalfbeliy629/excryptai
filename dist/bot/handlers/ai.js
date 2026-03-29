"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiHandler = aiHandler;
const ai_service_1 = require("../../services/ai.service");
const crypto_service_1 = require("../../services/crypto.service");
async function aiHandler(ctx) {
    try {
        let prompt = '';
        if (ctx.match) {
            prompt = ctx.match[1];
        }
        else {
            const text = ctx.message?.text || '';
            if (text.startsWith('/'))
                return;
            prompt = text;
        }
        if (!prompt) {
            return ctx.reply('Напиши: /ai твой вопрос');
        }
        // 🧠 определяем монету
        const match = prompt.match(/\b(BTC|ETH|SOL|XRP|BNB)\b/i);
        const symbol = match ? match[1].toUpperCase() : 'BTC';
        // 💰 получаем реальную цену
        const price = await (0, crypto_service_1.getCryptoPrice)(symbol);
        // 🤖 передаём в AI
        const response = await (0, ai_service_1.askAI)(prompt, {
            symbol,
            price,
        });
        await ctx.reply(`🤖 ${response}`);
    }
    catch (e) {
        console.error(e);
        ctx.reply('Ошибка AI');
    }
}
//# sourceMappingURL=ai.js.map