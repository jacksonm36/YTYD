import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildContentSecurityPolicy } from "./src/lib/app-origin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: [
    "bullmq",
    "ioredis",
    "@prisma/client",
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
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: buildContentSecurityPolicy(),
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
