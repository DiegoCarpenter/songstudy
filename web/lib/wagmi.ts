import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { arcTestnet } from "./arc";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/**
 * Without a WalletConnect project ID we only offer browser-extension wallets (MetaMask etc. are
 * still discovered via EIP-6963). With one, mobile/QR wallets are added too.
 */
const connectors = connectorsForWallets(
  projectId
    ? [{ groupName: "Recommended", wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet] }]
    : [{ groupName: "Browser wallets", wallets: [injectedWallet] }],
  { appName: "SongStudy", projectId: projectId || "songstudy-local" },
);

export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors,
  transports: { [arcTestnet.id]: fallback(arcTestnet.rpcUrls.default.http.map((u) => http(u))) },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
