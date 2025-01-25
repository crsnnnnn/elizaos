import { z } from "zod";
import { GetPriceContent } from "./types";

// Define known cryptocurrency patterns
const CRYPTO_PATTERNS = {
    BTC: /\b(btc|bitcoin|xbt)\b/i,
    ETH: /\b(eth|ethereum)\b/i,
    SOL: /\b(sol|solana)\b/i,
    ADA: /\b(ada|cardano)\b/i,
    XRP: /\b(xrp|ripple)\b/i,
    DOGE: /\b(doge|dogecoin)\b/i,
    DOT: /\b(dot|polkadot)\b/i,
    USDC: /\b(usdc)\b/i,
    USDT: /\b(usdt|tether)\b/i
};

// Enhanced schema with pattern matching
export const GetPriceSchema = z.object({
    symbol: z
        .string()
        .transform(val => val.toUpperCase())
        .refine(val => Object.keys(CRYPTO_PATTERNS).includes(val), {
            message: "Invalid cryptocurrency symbol"
        }),
    currency: z
        .string()
        .default("USD")
        .transform(val => val.toUpperCase())
});

export function isGetPriceContent(
    content: GetPriceContent
): content is GetPriceContent {
    try {
        GetPriceSchema.parse(content);
        return true;
    } catch (error) {
        return false;
    }
}

export function extractCryptoSymbol(text: string): string | null {
    // Check each crypto pattern
    for (const [symbol, pattern] of Object.entries(CRYPTO_PATTERNS)) {
        if (pattern.test(text)) {
            return symbol;
        }
    }
    return null;
}

export function shouldFetchPrice(text: string): boolean {
    // Common price query patterns
    const priceQueryPatterns = [
        /\b(price|worth|value|cost|rate)\b/i,
        /\b(how'?s|how is|what'?s|status|update|check|look|thoughts|analyze)\b/i,
        /\b(doing|going|performing)\b/i
    ];

    // If text directly mentions a crypto
    const hasCrypto = Object.values(CRYPTO_PATTERNS).some(pattern =>
        pattern.test(text)
    );

    // If text contains price query patterns
    const hasQuery = priceQueryPatterns.some(pattern =>
        pattern.test(text)
    );

    return hasCrypto && (hasQuery || text.length < 50); // Short messages with crypto mentions likely want price
}