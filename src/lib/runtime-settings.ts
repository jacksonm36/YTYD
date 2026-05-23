import { prisma } from "@/lib/prisma";
import {
  getServerSettingDef,
  SERVER_SETTING_KEYS,
} from "@/lib/server-settings-registry";

let overrides: Record<string, string> = {};
let loadedAt = 0;
const CACHE_MS = 15_000;

function envRaw(key: string, fallback = ""): string {
  const raw = process.env[key] ?? fallback;
  return raw.replace(/\r/g, "").trim();
}

/** Load DB overrides into memory (call on startup and after admin saves). */
export async function reloadRuntimeSettings(): Promise<void> {
  try {
    const rows = await prisma.serverSetting.findMany();
    overrides = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    loadedAt = Date.now();
  } catch {
    /* table may not exist during first migrate */
    overrides = {};
  }
}

async function ensureLoaded(): Promise<void> {
  if (Date.now() - loadedAt < CACHE_MS && loadedAt > 0) return;
  await reloadRuntimeSettings();
}

export function str(key: string, fallback = ""): string {
  if (overrides[key] !== undefined) return overrides[key];
  return envRaw(key, fallback);
}

export function num(key: string, fallback: number): number {
  if (overrides[key] !== undefined) {
    const n = Number(overrides[key]);
    if (!Number.isNaN(n)) return n;
  }
  const fromEnv = Number(envRaw(key, String(fallback)));
  return Number.isNaN(fromEnv) ? fallback : fromEnv;
}

export function bool(key: string, fallback: boolean): boolean {
  if (overrides[key] !== undefined) {
    const v = overrides[key].toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  }
  const raw = envRaw(key, fallback ? "true" : "false");
  return raw !== "false" && raw !== "0" && raw !== "";
}

export async function getEffectiveSettings(): Promise<
  Record<string, { value: string; source: "db" | "env" }>
> {
  await ensureLoaded();
  const out: Record<string, { value: string; source: "db" | "env" }> = {};
  for (const key of SERVER_SETTING_KEYS) {
    if (overrides[key] !== undefined) {
      out[key] = { value: overrides[key], source: "db" };
    } else {
      out[key] = { value: envRaw(key), source: "env" };
    }
  }
  return out;
}

export async function saveServerSettings(
  updates: Record<string, string>,
  adminUserId: string
): Promise<void> {
  for (const [key, value] of Object.entries(updates)) {
    const def = getServerSettingDef(key);
    if (!def) continue;
    validateSettingValue(def, value);
    await prisma.serverSetting.upsert({
      where: { key },
      create: { key, value, updatedBy: adminUserId },
      update: { value, updatedBy: adminUserId },
    });
  }
  await reloadRuntimeSettings();
}

export async function resetServerSetting(key: string): Promise<void> {
  if (!SERVER_SETTING_KEYS.has(key)) return;
  await prisma.serverSetting.deleteMany({ where: { key } });
  await reloadRuntimeSettings();
}

function validateSettingValue(
  def: ReturnType<typeof getServerSettingDef>,
  value: string
): void {
  if (!def) throw new Error("unknown setting");
  if (def.type === "boolean") {
    if (!/^(true|false|1|0|yes|no)$/i.test(value)) {
      throw new Error("invalid boolean");
    }
    return;
  }
  if (def.type === "number") {
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error("invalid number");
    if (def.min !== undefined && n < def.min) throw new Error("below min");
    if (def.max !== undefined && n > def.max) throw new Error("above max");
  }
}
