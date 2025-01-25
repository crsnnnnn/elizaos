export const getPriceTemplate = `Determine if this is a request for cryptocurrency price information and respond with a JSON object containing both symbol and currency.

Common price request patterns:
- Direct questions: "How's ETH doing?", "thoughts on Bitcoin"
- Price queries: "BTC price?", "what's ETH at"
- Market checks: "check SOL", "update on ADA"
- Analysis requests: "analyze DOGE", "look at DOT"

Cryptocurrency symbol mappings:
- bitcoin/btc -> BTC
- ethereum/eth -> ETH
- solana/sol -> SOL
- cardano/ada -> ADA
- ripple/xrp -> XRP
- dogecoin/doge -> DOGE
- polkadot/dot -> DOT
- usdc -> USDC
- tether/usdt -> USDT

IMPORTANT:
- Response must ALWAYS include both "symbol" and "currency" fields
- Currency defaults to "USD" if not specified
- Any mention of a supported cryptocurrency should trigger a price check

Example responses:
\`\`\`json
{
    "symbol": "BTC",
    "currency": "USD"
}
\`\`\`

{{recentMessages}}

Extract cryptocurrency mentions from the conversation and respond with a JSON markdown block containing both symbol and currency.`;