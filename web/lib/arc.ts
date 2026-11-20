import { arcTestnet as viemArcTestnet } from "viem/chains";
import { defineChain, formatUnits, getAddress, type Address } from "viem";

/** Arc testnet with our RPC first and arcscan as the explorer. Native gas token is USDC (18-dec view). */
const rpc = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";
export const arcTestnet = defineChain({
  ...viemArcTestnet,
  rpcUrls: { default: { http: [rpc, "https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "Arcscan", url: "https://testnet.arcscan.app" } },
});

/** USDC ERC-20 interface on Arc. 6 decimals (don't mix with the 18-decimal native balance). */
export const USDC_ADDRESS: Address = getAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000");
export const USDC_DECIMALS = 6;

export const MARKET_ADDRESS: Address = getAddress(
  process.env.NEXT_PUBLIC_SONGSTUDY_MARKET_ADDRESS || "0x5F7e6da30480Fc92190d17b3F51C7559c9F04A0F",
);
/** Block the market was deployed in: log scans start here. */
export const MARKET_DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_SONGSTUDY_MARKET_DEPLOY_BLOCK || "73102727");
/** Arc RPC rejects eth_getLogs spans over 10,000 blocks. */
export const LOG_CHUNK = 9_999n;

/** Price options in USDC base units (6 decimals). */
export const PRICE_OPTIONS = [
  { label: "Free", value: 0n },
  { label: "$0.05", value: 50_000n },
  { label: "$0.10", value: 100_000n },
  { label: "$0.25", value: 250_000n },
] as const;

export function formatUsd(units: bigint): string {
  if (units === 0n) return "Free";
  const n = Number(formatUnits(units, USDC_DECIMALS));
  return `$${n < 1 ? n.toFixed(2) : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export const txUrl = (hash: string) => `${arcTestnet.blockExplorers.default.url}/tx/${hash}`;
export const addressUrl = (a: string) => `${arcTestnet.blockExplorers.default.url}/address/${a}`;
export const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
