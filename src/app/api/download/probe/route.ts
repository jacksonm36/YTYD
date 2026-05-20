import { z } from "zod";
import { config } from "@/lib/config";
import {
  apiError,
  checkRateLimit,
  getClientIp,
  hashIp,
  validatePublicUrl,
} from "@/lib/security";
import { handleApiAuthError, requireApiSession } from "@/lib/api-auth";
import { probeUrl } from "@/lib/yt-dlp";
import { cleanupExpiredJobs } from "@/lib/jobs";
import { cacheProbeFormats } from "@/lib/probe-cache";

const schema = z.object({
  url: z.string().url().max(2048),
});

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(request);
    const ip = getClientIp(request);
    await checkRateLimit({
      action: "probe",
      userId: session.user!.id,
      ipHash: hashIp(ip),
    });

    const body = schema.parse(await request.json());
    const url = (await validatePublicUrl(body.url)).toString();

    void cleanupExpiredJobs();

    const result = await probeUrl(url);

    if (result.duration > config.maxVideoDurationSeconds) {
      return apiError("videoTooLong", 400);
    }

    const formatIds = result.formats.map((f) => f.formatId);
    formatIds.push("bestvideo+bestaudio/best");
    cacheProbeFormats(session.user!.id, url, formatIds);

    return Response.json(result);
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    if (err instanceof z.ZodError) return apiError("invalidUrl", 400);
    if (err instanceof Error) {
      if (err.message === "invalidUrl") return apiError("invalidUrl", 400);
      if (err.message === "unsupportedPlatform") {
        return apiError("unsupportedPlatform", 400);
      }
      if (err.message === "rateLimited") return apiError("rateLimited", 429);
      if (
        err.message.includes("ENOENT") ||
        err.message.includes("spawn ") && err.message.includes(" ENOENT")
      ) {
        console.error("[probe] yt-dlp not found:", config.ytdlpPath);
        return apiError("ytdlpNotFound", 503);
      }
    }
    console.error("[probe]", err);
    return apiError("generic", 500);
  }
}
