import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { config } from "@/lib/config";

type Argon2Module = {
  hash: (
    password: string,
    options: {
      type: number;
      memoryCost: number;
      timeCost: number;
      parallelism: number;
    }
  ) => Promise<string>;
  verify: (hash: string, password: string) => Promise<boolean>;
  argon2id: number;
};

let argon2Module: Argon2Module | null | undefined;

async function loadArgon2(): Promise<Argon2Module | null> {
  if (argon2Module !== undefined) return argon2Module;
  try {
    argon2Module = (await import("argon2")) as Argon2Module;
    return argon2Module;
  } catch {
    argon2Module = null;
    return null;
  }
}

function getPepper(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.HASH_PEPPER ?? "";
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET (min 16 chars) is required for secure hashing");
  }
  return secret;
}

function isBcryptHash(hash: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(hash);
}

function isArgon2Hash(hash: string): boolean {
  return hash.startsWith("$argon2");
}

/**
 * HMAC-SHA256 for non-password secrets (IPs, identifiers).
 * Deterministic — same input + purpose yields same digest.
 */
export function hashSensitive(value: string, purpose: string): string {
  const normalized = value.trim().toLowerCase();
  return createHmac("sha256", getPepper())
    .update(`v1:${purpose}:${normalized}`)
    .digest("hex");
}

export function hashIp(ip: string): string {
  return hashSensitive(ip, "rate-limit-ip");
}

/**
 * Hash password with Argon2id (preferred) or bcrypt (fallback if Argon2 unavailable).
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  if (config.passwordAlgorithm === "bcrypt") {
    return bcrypt.hash(plainPassword, config.bcryptCost);
  }

  const argon2 = await loadArgon2();
  if (!argon2) {
    return bcrypt.hash(plainPassword, config.bcryptCost);
  }

  return argon2.hash(plainPassword, {
    type: argon2.argon2id,
    memoryCost: config.argon2MemoryCost,
    timeCost: config.argon2TimeCost,
    parallelism: config.argon2Parallelism,
  });
}

export type VerifyPasswordResult = {
  valid: boolean;
  /** True when a legacy bcrypt hash verified — caller should rehash with Argon2id */
  needsRehash: boolean;
};

/**
 * Verify password against stored hash (Argon2id or legacy bcrypt).
 */
export async function verifyPassword(
  plainPassword: string,
  storedHash: string
): Promise<VerifyPasswordResult> {
  if (isBcryptHash(storedHash)) {
    const valid = await bcrypt.compare(plainPassword, storedHash);
    return { valid, needsRehash: valid && config.passwordAlgorithm !== "bcrypt" };
  }

  if (isArgon2Hash(storedHash)) {
    const argon2 = await loadArgon2();
    if (!argon2) {
      return { valid: false, needsRehash: false };
    }
    try {
      const valid = await argon2.verify(storedHash, plainPassword);
      return { valid, needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }

  return { valid: false, needsRehash: false };
}

/** Upgrade legacy bcrypt hash to Argon2id after successful login */
export async function rehashPasswordIfNeeded(
  userId: string,
  plainPassword: string,
  storedHash: string
): Promise<void> {
  const { valid, needsRehash } = await verifyPassword(plainPassword, storedHash);
  if (!valid || !needsRehash) return;

  const { prisma } = await import("@/lib/prisma");
  const passwordHash = await hashPassword(plainPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

/** Constant-time compare for hex digests */
export function safeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "hex");
    const bufB = Buffer.from(b, "hex");
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
