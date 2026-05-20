import { SignJWT, jwtVerify } from "jose";
import { config } from "@/lib/config";
import {
  consumeDownloadJti,
  createDownloadJti,
  registerDownloadJti,
  type DownloadTokenPayload,
} from "@/lib/download-token-store";

export type { DownloadTokenPayload } from "@/lib/download-token-store";

const DOWNLOAD_TOKEN_TTL = "15m";

function getDownloadSecret(): Uint8Array {
  const secret = config.downloadTokenSecret;
  if (secret.length < 32) {
    throw new Error(
      "DOWNLOAD_TOKEN_SECRET or AUTH_SECRET must be at least 32 characters"
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createDownloadToken(
  payload: DownloadTokenPayload
): Promise<string> {
  const jti = createDownloadJti();
  await registerDownloadJti(jti, payload);

  return new SignJWT({ jobId: payload.jobId, userId: payload.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(DOWNLOAD_TOKEN_TTL)
    .setSubject(payload.userId)
    .setAudience("yaytd-download")
    .sign(getDownloadSecret());
}

export async function verifyAndConsumeDownloadToken(
  token: string
): Promise<DownloadTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getDownloadSecret(), {
      algorithms: ["HS256"],
      audience: "yaytd-download",
    });

    const jti = payload.jti;
    const jobId = payload.jobId as string | undefined;
    const userId = payload.userId as string | undefined;
    if (!jti || !jobId || !userId) return null;

    const consumed = await consumeDownloadJti(String(jti));
    if (!consumed || consumed.jobId !== jobId || consumed.userId !== userId) {
      return null;
    }

    return { jobId, userId };
  } catch {
    return null;
  }
}

/** @deprecated Use verifyAndConsumeDownloadToken — query tokens are no longer supported. */
export async function verifyDownloadToken(
  token: string
): Promise<DownloadTokenPayload | null> {
  return verifyAndConsumeDownloadToken(token);
}
