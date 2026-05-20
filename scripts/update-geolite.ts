/**
 * Download GeoLite2-City MMDB using MAXMIND_LICENSE_KEY from .env
 * Usage: npx tsx scripts/update-geolite.ts
 */
import { config } from "../src/lib/config";
import { downloadGeoLiteCityDb } from "../src/lib/geoip-download";

async function main() {
  if (!config.maxmindLicenseKey) {
    console.error("Set MAXMIND_LICENSE_KEY in .env");
    process.exit(1);
  }
  const target = process.env.MAXMIND_GEOLITE_CITY_PATH ?? config.maxmindDbPath;
  console.log(`Downloading GeoLite2-City to ${target}...`);
  await downloadGeoLiteCityDb(target);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
