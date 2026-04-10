import { defineChain } from "viem";

export const xlayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
  rpcUrls: { default: { http: ["https://rpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer" } },
});

export const xlayerTestnet = defineChain({
  id: 195,
  name: "X Layer Testnet",
  nativeCurrency: { decimals: 18, name: "OKB", symbol: "OKB" },
  rpcUrls: { default: { http: ["https://testrpc.xlayer.tech"] } },
  blockExplorers: { default: { name: "OKLink", url: "https://www.oklink.com/xlayer-test" } },
  testnet: true,
});

export const CONTRACTS = {
  DCA_AGENT: (process.env.NEXT_PUBLIC_DCA_AGENT_ADDRESS || "0x0000000000000000000000000000000000000000") as `0x${string}`,
};

export interface Token {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

export const TOKENS: Token[] = [
  { address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", symbol: "OKB", name: "OKB (Native)", decimals: 18 },
  { address: "0x74b7F16337b8972027F6196A17a631aC6dE26d22", symbol: "USDC", name: "USD Coin", decimals: 6 },
  { address: "0x1E4a5963aBFD975d8c9021ce480b42188849D41d", symbol: "USDT", name: "Tether USD", decimals: 6 },
  { address: "0xe7b000003a45145decf8a28fc755ad5ec5ea025a", symbol: "WETH", name: "Wrapped ETH", decimals: 18 },
  { address: "0xe538905cf8410324e03A5A23C1c177a474D59b2b", symbol: "WOKB", name: "Wrapped OKB", decimals: 18 },
  { address: "0xb7c00000bcdeef966b20b3d884b98e64d2b06b4f", symbol: "WBTC", name: "Wrapped BTC", decimals: 8 },
];

export const INTERVALS = [
  { label: "Every 1 min (test)", value: 60 },
  { label: "Every 1 hour", value: 3600 },
  { label: "Every 4 hours", value: 14400 },
  { label: "Daily", value: 86400 },
  { label: "Weekly", value: 604800 },
];

export const OKX_API_BASE = "https://web3.okx.com";
export const XLAYER_CHAIN_INDEX = "196";
