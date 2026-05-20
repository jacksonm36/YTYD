import "server-only";

import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { hashIp } from "@/lib/crypto";
import type { GeoIpResult } from "@/lib/geoip-types";

export type RecordLoginParams = {
  success: boolean;
  loginId?: string | null;
  userId?: string | null;
  ipAddress: string;
  userAgent?: string | null;
};

export async function recordLoginEvent(params: RecordLoginParams): Promise<void> {
  const ipAddress = params.ipAddress || "unknown";
  const ipHash = hashIp(ipAddress);

  let geo: GeoIpResult | null = null;
  try {
    const { lookupGeoIp } = await import("@/lib/geoip");
    geo = await Promise.race([
      lookupGeoIp(ipAddress),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3500)),
    ]);
  } catch {
    geo = null;
  }

  await prisma.loginEvent.create({
    data: {
      userId: params.userId ?? null,
      loginId: params.loginId?.slice(0, 255) ?? null,
      success: params.success,
      ipAddress,
      ipHash,
      userAgent: params.userAgent?.slice(0, 512) ?? null,
      countryCode: geo?.countryCode ?? null,
      countryName: geo?.countryName ?? null,
      region: geo?.region ?? null,
      city: geo?.city ?? null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
      timezone: geo?.timezone ?? null,
    },
  });

  const retentionDays = config.loginHistoryRetentionDays;
  if (retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    void prisma.loginEvent
      .deleteMany({ where: { createdAt: { lt: cutoff } } })
      .catch(() => undefined);
  }
}
