"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { lightTheme, RainbowKitProvider, type Theme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { arcTestnet } from "@/lib/arc";
import { wagmiConfig } from "@/lib/wagmi";

/** RainbowKit modal restyled to match SongStudy: white, 24px radius, Inter, warm accent, no heavy shadows. */
const base = lightTheme({ accentColor: "var(--brand)", accentColorForeground: "white", borderRadius: "large", overlayBlur: "small" });
const theme: Theme = {
  ...base,
  colors: {
    ...base.colors,
    modalBackground: "#ffffff",
    modalBorder: "rgba(0,0,0,0.06)",
    modalBackdrop: "rgba(20,20,24,0.25)",
    generalBorder: "rgba(0,0,0,0.06)",
    actionButtonSecondaryBackground: "#f7f7f8",
    profileForeground: "#f7f7f8",
    menuItemBackground: "#f7f7f8",
  },
  fonts: { body: "var(--font-inter), ui-sans-serif, system-ui, sans-serif" },
  radii: { ...base.radii, modal: "24px", modalMobile: "24px", actionButton: "999px", connectButton: "999px", menuButton: "16px" },
  shadows: { ...base.shadows, dialog: "0 1px 2px rgba(0,0,0,0.04)", connectButton: "none", profileDetailsAction: "none", selectedOption: "none", selectedWallet: "none", walletLogo: "none" },
};

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={theme} initialChain={arcTestnet} modalSize="compact" appInfo={{ appName: "SongStudy" }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
