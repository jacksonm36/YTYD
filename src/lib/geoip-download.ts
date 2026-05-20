import "server-only";

import { access, mkdir, readdir, rename, rm, writeFile } from "fs/promises";
import path from "path";
import { config } from "@/lib/config";

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMmdbFile(dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findMmdbFile(full);
      if (nested) return nested;
    } else if (entry.name.endsWith(".mmdb")) {
      return full;
    }
  }
  return null;
}

/** Download GeoLite2-City MMDB (CLI / install script only — uses `tar`). */
export async function downloadGeoLiteCityDb(
  targetPath = path.resolve(config.maxmindDbPath)
): Promise<void> {
  const licenseKey = config.maxmindLicenseKey;
  if (!licenseKey) {
    throw new Error("MAXMIND_LICENSE_KEY is not set");
  }

  const url = new URL(
    "https://download.maxmind.com/geoip/databases/GeoLite2-City/download"
  );
  url.searchParams.set("suffix", "tar.gz");
  url.searchParams.set("license_key", licenseKey);

  const res = await fetch(url.toString(), {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    throw new Error(
      `MaxMind GeoLite2 download failed (HTTP ${res.status}). Verify MAXMIND_LICENSE_KEY.`
    );
  }

  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tgzPath = path.join(dir, "GeoLite2-City.tar.gz");
  await writeFile(tgzPath, Buffer.from(await res.arrayBuffer()));

  const tmpDir = path.join(dir, ".geolite-extract");
  await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(tmpDir, { recursive: true });

  const tar = await import("tar");
  await tar.x({ file: tgzPath, cwd: tmpDir });

  const mmdb = await findMmdbFile(tmpDir);
  if (!mmdb) {
    throw new Error("GeoLite2-City.mmdb not found in downloaded archive");
  }

  await rename(mmdb, targetPath);
  await rm(tmpDir, { recursive: true, force: true });
  await rm(tgzPath, { force: true }).catch(() => undefined);
}
