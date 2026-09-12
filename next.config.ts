import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `ws` (used by @neondatabase/serverless for the interactive-transaction
  // WebSocket client) does a conditional native require for `bufferutil`
  // that webpack's bundling breaks ("bufferUtil.mask is not a function").
  // Keep both as real Node requires instead of bundling them.
  serverExternalPackages: ["@neondatabase/serverless", "ws"],
};

export default nextConfig;
