import { Plugin } from "@elizaos/core";
import { TokenPriceAction } from "./actions/tokenAction";
import { TokenPriceEvaluator } from "./evaluators/tokenEvaluator";
import { TokenPriceProvider } from "./providers/tokenProvider";
import {
    latestTokensAction,
    latestBoostedTokensAction,
    topBoostedTokensAction
} from "./actions/trendsAction";

export * as actions from "./actions";
export * as evaluators from "./evaluators";
export * as providers from "./providers";

// Using named export
export const plugin: Plugin = {
    name: "dexscreener",
    description:
        "Dex Screener Plugin with Token Price Action, Token Trends, Evaluators and Providers",
    actions: [
        new TokenPriceAction(),
        latestTokensAction,
        latestBoostedTokensAction,
        topBoostedTokensAction
    ],
    evaluators: [new TokenPriceEvaluator()],
    providers: [new TokenPriceProvider()],
};