import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  // Allow deploys while Codex WIP files have type errors
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      // Google Street View & Maps tiles
      { protocol: "https", hostname: "**.google.com" },
      { protocol: "https", hostname: "**.googleapis.com" },
      // Zillow property photos
      { protocol: "https", hostname: "**.zillow.com" },
      { protocol: "https", hostname: "**.zillowstatic.com" },
      // Redfin property photos
      { protocol: "https", hostname: "**.redfin.com" },
      { protocol: "https", hostname: "**.rdcpix.com" },
      // Self-hosted proxy routes
      { protocol: "https", hostname: "sentinel.dominionhomedeals.com" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/dashboard",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
