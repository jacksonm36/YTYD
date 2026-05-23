import { isValidInviteToken } from "@/lib/invites";
import { checkRateLimit, getClientIp, hashIp } from "@/lib/security";

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    await checkRateLimit({ action: "login", ipHash: hashIp(ip) });
  } catch {
    return Response.json({ error: "rateLimited" }, { status: 429 });
  }

  const token = new URL(request.url).searchParams.get("token");
  const valid = await isValidInviteToken(token);
  return Response.json({ valid });
}
