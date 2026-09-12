import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Backend-only for now: route handlers under app/update and
  // app/project-state. The dashboard (app/page.tsx) is a placeholder
  // until the visibility layer described in plan.md is built.

  // `ws` (used by @neondatabase/serverless for the interactive-transaction
  // WebSocket client) does a conditional native require for `bufferutil`
  // that webpack's bundling breaks ("bufferUtil.mask is not a function").
  // Keep both as real Node requires instead of bundling them.
  serverExternalPackages: ["@neondatabase/serverless", "ws"],
};

export default nextConfig;
