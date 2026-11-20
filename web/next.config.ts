import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The dev badge sits on top of the song list (and shows up in demo recordings).
  devIndicators: false,
  // pdf-parse loads pdf.js workers at runtime; keep it out of the server bundle.
  // @base-org/account (pulled in by RainbowKit/wagmi connectors) → @coinbase/cdp-sdk has optional
  // @x402/* imports Turbopack can't resolve during SSR bundling; let Node load them at runtime instead.
  serverExternalPackages: ["pdf-parse", "@base-org/account", "@coinbase/cdp-sdk"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
