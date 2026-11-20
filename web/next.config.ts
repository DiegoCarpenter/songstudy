import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The dev badge sits on top of the song list (and shows up in demo recordings).
  devIndicators: false,
  // pdf-parse loads pdf.js workers at runtime; keep it out of the server bundle.
  serverExternalPackages: ["pdf-parse"],
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
