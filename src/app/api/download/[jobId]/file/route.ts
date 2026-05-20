import { createReadStream } from "fs";
import { stat } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";
import { config } from "@/lib/config";
import { apiError } from "@/lib/security";
import {
  handleApiAuthError,
  requireApiSession,
} from "@/lib/api-auth";
import { verifyAndConsumeDownloadToken } from "@/lib/jwt-tokens";

function isPathUnderJobDir(jobId: string, filePath: string): boolean {
  const base = path.resolve(config.tempDownloadDir, jobId);
  const resolved = path.resolve(filePath);
  return resolved === base || resolved.startsWith(`${base}${path.sep}`);
}

function parseBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const queryToken = new URL(request.url).searchParams.get("token");
    if (queryToken) {
      return apiError("unauthorized", 401);
    }

    const bearer = parseBearerToken(request);
    let userId: string | null = null;

    if (bearer) {
      const payload = await verifyAndConsumeDownloadToken(bearer);
      if (!payload || payload.jobId !== jobId) {
        return apiError("unauthorized", 401);
      }
      userId = payload.userId;
    } else {
      const session = await requireApiSession(request);
      userId = session.user!.id;
    }

    if (!userId) {
      return apiError("unauthorized", 401);
    }

    const job = await prisma.downloadJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) return apiError("notFound", 404);
    if (job.status !== "ready" || !job.filePath) {
      return apiError("notFound", 404);
    }
    if (job.expiresAt < new Date()) {
      return apiError("jobExpired", 410);
    }

    if (!isPathUnderJobDir(jobId, job.filePath)) {
      console.error("[file] path outside job dir:", job.filePath);
      return apiError("notFound", 404);
    }

    const fileStat = await stat(job.filePath);
    const stream = createReadStream(job.filePath);
    const webStream = Readable.toWeb(stream) as ReadableStream;
    const fileName = job.fileName ?? "download";

    return new Response(webStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(fileStat.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
        "Cache-Control": "no-store, no-cache, private",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    const authRes = handleApiAuthError(err);
    if (authRes) return authRes;
    return apiError("notFound", 404);
  }
}
