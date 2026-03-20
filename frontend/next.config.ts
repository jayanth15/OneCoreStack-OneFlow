import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8000";

const withPWA = withPWAInit({
  dest: "public",           // output sw.js + workbox files to /public
  cacheOnFrontEndNav: true, // cache pages visited during navigation
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,     // reload when network comes back
  disable: process.env.NODE_ENV === "development", // no SW in dev mode
  workboxOptions: {
    disableDevLogs: true,
    // Never cache API calls — always hit the network
    runtimeCaching: [
      {
        urlPattern: /^\/api\//,
        handler: "NetworkOnly",
      },
    ],
  },
});

const nextConfig: NextConfig = {
  // Silence the Turbopack + webpack plugin warning in dev
  turbopack: {},
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default withPWA(nextConfig);
