import "server-only";

import { access } from "fs/promises";
import path from "path";
import { config } from "@/lib/config";
import { isPrivateIp, isValidIp } from "@/lib/client-ip";
import type { GeoIpResult } from "@/lib/geoip-types";

export type { GeoIpResult } from "@/lib/geoip-types";

type GeoIp2Reader = {
  city(ip: string): {
    country?: { isoCode?: string; names?: { en?: string } };
    subdivisions?: { isoCode?: string; names?: { en?: string } }[];
    city?: { names?: { en?: string } };
    location?: {
      latitude?: number;
      longitude?: number;
      timeZone?: string;
    };
  };
};

let readerPromise: Promise<GeoIp2Reader | null> | null = null;

function mapCityResponse(res: ReturnType<GeoIp2Reader["city"]>): GeoIpResult {
  const sub = res.subdivisions?.[0];
  return {
    countryCode: res.country?.isoCode ?? null,
    countryName: res.country?.names?.en ?? null,
    region: sub?.names?.en ?? sub?.isoCode ?? null,
    city: res.city?.names?.en ?? null,
    latitude: res.location?.latitude ?? null,
    longitude: res.location?.longitude ?? null,
    timezone: res.location?.timeZone ?? null,
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getLocalReader(): Promise<GeoIp2Reader | null> {
  if (!readerPromise) {
    readerPromise = (async () => {
      const dbPath = path.resolve(config.maxmindDbPath);
      if (!(await fileExists(dbPath))) {
        console.warn(
          "[geoip] MMDB missing. Run: npm run geoip:update (requires MAXMIND_LICENSE_KEY)"
        );
        return null;
      }
      try {
        const { Reader } = await import("@maxmind/geoip2-node");
        const reader = await Reader.open(dbPath);
        return reader as unknown as GeoIp2Reader;
      } catch (err) {
        console.warn("[geoip] Failed to open MMDB:", err);
        return null;
      }
    })();
  }
  return readerPromise;
}

async function lookupWebService(ip: string): Promise<GeoIpResult | null> {
  const accountId = config.maxmindAccountId;
  const licenseKey = config.maxmindLicenseKey;
  if (!accountId || !licenseKey) return null;

  const auth = Buffer.from(`${accountId}:${licenseKey}`).toString("base64");
  const url = `https://geoip.maxmind.com/geoip/v2.1/city/${encodeURIComponent(ip)}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(4000),
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    country?: { iso_code?: string; names?: { en?: string } };
    subdivisions?: { iso_code?: string; names?: { en?: string } }[];
    city?: { names?: { en?: string } };
    location?: {
      latitude?: number;
      longitude?: number;
      time_zone?: string;
    };
  };

  const sub = data.subdivisions?.[0];
  return {
    countryCode: data.country?.iso_code ?? null,
    countryName: data.country?.names?.en ?? null,
    region: sub?.names?.en ?? sub?.iso_code ?? null,
    city: data.city?.names?.en ?? null,
    latitude: data.location?.latitude ?? null,
    longitude: data.location?.longitude ?? null,
    timezone: data.location?.time_zone ?? null,
  };
}

export async function lookupGeoIp(ip: string): Promise<GeoIpResult | null> {
  if (!isValidIp(ip) || isPrivateIp(ip) || ip === "unknown") {
    return null;
  }

  try {
    const reader = await getLocalReader();
    if (reader) {
      return mapCityResponse(reader.city(ip));
    }
  } catch {
    /* try web service */
  }

  try {
    return await lookupWebService(ip);
  } catch {
    return null;
  }
}
