import {
    composeContext,
    elizaLogger,
    generateObjectDeprecated,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    ModelClass,
    State,
    type Action,
} from "@elizaos/core";
import { validateCoinMarketCapConfig } from "../../environment";
import { priceExamples } from "./examples";
import { createPriceService } from "./service";
import { getPriceTemplate } from "./template";
import { GetPriceContent } from "./types";
import { isGetPriceContent, shouldFetchPrice, extractCryptoSymbol } from "./validation";

export default {
    name: "GET_PRICE",
    similes: [
        "CHECK_PRICE",
        "PRICE_CHECK",
        "GET_CRYPTO_PRICE",
        "CHECK_CRYPTO_PRICE",
        "GET_TOKEN_PRICE",
        "CHECK_TOKEN_PRICE",
    ],
    validate: async (runtime: IAgentRuntime, message: Memory) => {
        await validateCoinMarketCapConfig(runtime);
        const content = typeof message.content === "string"
            ? message.content
            : message.content?.text;

        return content ? shouldFetchPrice(content) : false;
    },
    description: "Get the current price of a cryptocurrency from CoinMarketCap",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: { [key: string]: unknown },
        callback?: HandlerCallback
    ): Promise<boolean> => {
        elizaLogger.log("🚀 Starting CoinMarketCap GET_PRICE handler...");

        // Check for direct crypto mention first
        const messageText = typeof message.content === "string"
            ? message.content
            : message.content?.text;

        elizaLogger.log("📝 Message text:", messageText);

        const directSymbol = messageText ? extractCryptoSymbol(messageText) : null;
        elizaLogger.log("🔍 Extracted symbol:", directSymbol);

        try {
            let content: GetPriceContent;

            if (directSymbol) {
                elizaLogger.log("✅ Using direct symbol:", directSymbol);
                content = {
                    symbol: directSymbol,
                    currency: "USD"
                };
            } else {
                elizaLogger.log("🔄 Falling back to template generation");
                if (!state) {
                    state = (await runtime.composeState(message)) as State;
                } else {
                    state = await runtime.updateRecentMessageState(state);
                }

                const priceContext = composeContext({
                    state,
                    template: getPriceTemplate,
                });

                content = (await generateObjectDeprecated({
                    runtime,
                    context: priceContext,
                    modelClass: ModelClass.SMALL,
                })) as unknown as GetPriceContent;
            }

            elizaLogger.log("📦 Content generated:", content);

            // Validate content
            if (!isGetPriceContent(content)) {
                throw new Error("Invalid price check content");
            }

            elizaLogger.log("✅ Content validated");

            // Get price from CoinMarketCap
            elizaLogger.log("🔑 Validating CMC config...");
            const config = await validateCoinMarketCapConfig(runtime);
            elizaLogger.log("✅ Config validated");

            elizaLogger.log("🔄 Creating price service...");
            const priceService = createPriceService(
                config.COINMARKETCAP_API_KEY
            );
            elizaLogger.log("✅ Price service created");

            try {
                elizaLogger.log("🚀 Fetching price data...");
                const priceData = await priceService.getPrice(
                    content.symbol,
                    content.currency
                );
                elizaLogger.log("✅ Price data received:", priceData);

                if (callback) {
                    const formattedPrice = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: content.currency,
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    }).format(priceData.price);

                    const change24h = priceData.percentChange24h > 0
                        ? `+${priceData.percentChange24h.toFixed(2)}%`
                        : `${priceData.percentChange24h.toFixed(2)}%`;

                    const response = `Current ${content.symbol} price: ${formattedPrice}\n24h Change: ${change24h}`;
                    elizaLogger.log("📤 Sending response:", response);

                    callback({
                        text: response,
                        content: {
                            symbol: content.symbol,
                            currency: content.currency,
                            ...priceData,
                        },
                    });
                }
                return true;
            } catch (error) {
                elizaLogger.error("❌ Error in price fetch:", error);
                if (callback) {
                    callback({
                        text: `Error fetching price: ${error.message}`,
                        content: { error: error.message },
                    });
                }
                return false;
            }
        } catch (error) {
            elizaLogger.error("❌ Error in handler:", error);
            if (callback) {
                callback({
                    text: `Error fetching price: ${error.message}`,
                    content: { error: error.message },
                });
            }
            return false;
        }
    },
    examples: priceExamples,
} as Action;