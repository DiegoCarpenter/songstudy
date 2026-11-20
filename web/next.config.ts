import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
