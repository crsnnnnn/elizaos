import axios from "axios";
import { ApiResponse, PriceData } from "./types";

const BASE_URL = "https://pro-api.coinmarketcap.com/v1";

export const createPriceService = (apiKey: string) => {
    const client = axios.create({
        baseURL: BASE_URL,
        headers: {
            "X-CMC_PRO_API_KEY": apiKey,
            Accept: "application/json",
        },
    });

// In service.ts, update the getPrice function:

const getPrice = async (
    symbol: string,
    currency: string
): Promise<PriceData> => {
    const normalizedSymbol = symbol.toUpperCase().trim();
    const normalizedCurrency = currency.toUpperCase().trim();
    try {
        console.log(`Making API request for ${normalizedSymbol}/${normalizedCurrency}`);

        const response = await client.get<ApiResponse>(
            "/cryptocurrency/quotes/latest",
            {
                params: {
                    symbol: normalizedSymbol,
                    convert: normalizedCurrency,
                }
            }
        );

        console.log("Full API Response:", JSON.stringify(response.data, null, 2));

        const symbolData = response.data.data[normalizedSymbol];
        if (!symbolData) {
            console.log("No symbol data found in response");
            throw new Error(
                `No data found for symbol: ${normalizedSymbol}`
            );
        }

        const quoteData = symbolData.quote[normalizedCurrency];
        if (!quoteData) {
            console.log("No quote data found in response");
            throw new Error(
                `No quote data found for currency: ${normalizedCurrency}`
            );
        }

        console.log("Processed price data:", {
            price: quoteData.price,
            marketCap: quoteData.market_cap,
            volume24h: quoteData.volume_24h,
            percentChange24h: quoteData.percent_change_24h,
        });

        return {
            price: quoteData.price,
            marketCap: quoteData.market_cap,
            volume24h: quoteData.volume_24h,
            percentChange24h: quoteData.percent_change_24h,
        };
    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.error("Full error response:", error.response?.data);
            const errorMessage =
                error.response?.data?.status?.error_message ||
                error.message;
            console.error("API Error:", errorMessage);
            throw new Error(`API Error: ${errorMessage}`);
        }
        console.error("Non-Axios error:", error);
        throw error;
    }
};

    return { getPrice };
};
