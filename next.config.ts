import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "@prisma/client",
    "@prisma/adapter-pg",
    "pg",
    "bcryptjs",
    "argon2",
    "@maxmind/geoip2-node",
    "tar",
  ],
  experimental: {
    optimizePackageImports: ["next-intl", "next-auth/react"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default withNextIntl(nextConfig);
